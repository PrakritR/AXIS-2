"use client";

import { useCallback, useState } from "react";

import { notifyAgentPendingActionsChanged } from "@/lib/axis-assistant/pending-actions-events";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolTraceEntry = { tool: string; ok: boolean };

/**
 * The user-facing preview of a proposed write action, exactly as the server's
 * `ActionPreview` (kept structurally identical so the confirm gate is what runs,
 * not a re-derived client value).
 */
export type ActionPreview = {
  kind: string;
  title: string;
  confirmLabel: string;
  fields: { label: string; value: string }[];
  warnings?: string[];
};
export type PendingAction = { id: string; preview: ActionPreview };

/**
 * Confirm outcomes the server answers WITHOUT claiming the proposal, so the
 * action is still live and pressing Confirm again is genuinely valid: the
 * fail-closed peek's 503, plus rate limiting and any other transient 5xx.
 * Everything else (410 gone/expired/replayed, 400 refused, 401/403) is
 * terminal — the row is spent or unreachable and the card must clear.
 */
function isRetryableConfirmStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Headless conversation state + transport for the PropLane assistant. Both the
 * floating modal (`axis-assistant.tsx`) and the dashboard right-dock consume
 * this so there is ONE send/confirm loop, not two.
 *
 * Security note: the confirm/deny path posts ONLY the pending action id back to
 * the same auth-gated `endpoint`; the server re-validates the stored input and
 * runs the handler behind `claimPendingAction`. This hook never executes a
 * write itself and never posts model-/client-supplied action arguments at
 * confirm time.
 */
export function useAssistantConversation(endpoint: string) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (prompt?: string) => {
      const text = (prompt ?? input).trim();
      if (!text || loading) return;
      setError(null);
      let hadPending = false;
      setPendingAction((prev) => {
        hadPending = prev !== null;
        return null;
      });
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      setLoading(true);
      setLastTools([]);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        const data = (await res.json()) as {
          reply?: string;
          toolTrace?: ToolTraceEntry[];
          pendingAction?: PendingAction;
          error?: string;
        };
        if (!res.ok || data.error) {
          setError(data.error ?? "Something went wrong.");
        } else {
          setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
          setLastTools(data.toolTrace ?? []);
          setPendingAction(data.pendingAction ?? null);
          // A freshly proposed draft (or one that was cleared by re-asking) should
          // refresh the dashboard's AI-drafts chips on the same tick.
          if (data.pendingAction || hadPending) notifyAgentPendingActionsChanged();
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [endpoint, input, loading, messages],
  );

  /** Confirm or cancel the proposed action; either way the outcome is appended
   * to the conversation so the next turn stays coherent. Confirm routes through
   * the server's `claimPendingAction` re-validation — never a client-side send. */
  const resolvePendingAction = useCallback(
    async (decision: "confirm" | "deny") => {
      if (!pendingAction || loading) return;
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            decision === "confirm"
              ? { confirmActionId: pendingAction.id }
              : { denyActionId: pendingAction.id },
          ),
        });
        const data = (await res.json()) as {
          reply?: string;
          toolTrace?: ToolTraceEntry[];
          error?: string;
        };
        if (!res.ok || data.error) {
          setError(data.error ?? "Could not complete that action.");
          // A retryable failure never claimed the row — it is still `proposed`
          // server-side, so keep the card rather than orphaning a live proposal
          // (resident and vendor portals have no AI-drafts list to recover it).
          if (!isRetryableConfirmStatus(res.status)) setPendingAction(null);
        } else {
          setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Done." }]);
          setLastTools(data.toolTrace ?? []);
          setPendingAction(null);
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
        notifyAgentPendingActionsChanged();
      }
    },
    [endpoint, loading, pendingAction],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setLastTools([]);
    setPendingAction(null);
    setError(null);
    setInput("");
  }, []);

  return {
    input,
    setInput,
    messages,
    lastTools,
    pendingAction,
    loading,
    error,
    send,
    resolvePendingAction,
    reset,
  } as const;
}
