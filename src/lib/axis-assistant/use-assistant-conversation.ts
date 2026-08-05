"use client";

import { useCallback, useEffect, useState } from "react";

import {
  attachmentsToApiPayload,
  revokeAttachmentPreview,
  userMessageContentFromInput,
  type PendingChatAttachment,
} from "@/lib/assistant-chat-attachments.client";
import {
  clearAssistantChatMessages,
  loadAssistantChatMessages,
  saveAssistantChatMessages,
} from "@/lib/axis-assistant/assistant-chat-storage";
import type { AssistantChatThreadSummary } from "@/lib/axis-assistant/assistant-chat-threads";
import {
  loadAssistantThreadState,
  persistAssistantThreadMessages,
  startNewAssistantThread,
  switchAssistantThread,
} from "@/lib/axis-assistant/assistant-chat-threads";
import { notifyAgentPendingActionsChanged } from "@/lib/axis-assistant/pending-actions-events";
import { notifyListingAssistantUpdated } from "@/lib/listing-assistant-events";

/**
 * `traceId` is the Langfuse trace behind an assistant reply. It is what a thumbs
 * rating attaches to, so only assistant messages carry one, and only when
 * Langfuse is configured — a message without it renders no rating control.
 * Deliberately NOT sent back up as conversation history: the server re-derives
 * every turn, and the feedback route re-verifies ownership server-side.
 */
export type ChatMessage = { role: "user" | "assistant"; content: string; traceId?: string };
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

type AssistantTransportData = {
  reply?: string;
  toolTrace?: ToolTraceEntry[];
  pendingAction?: PendingAction;
  error?: string;
  sessionId?: string | null;
  traceId?: string;
};

/** Parse the SSE transport while retaining JSON compatibility for older routes. */
async function readAssistantTransport(
  res: Response,
  onDelta: (text: string) => void,
): Promise<AssistantTransportData> {
  const contentType = res.headers?.get?.("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    return (await res.json()) as AssistantTransportData;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let pendingAction: PendingAction | undefined;
  let done: AssistantTransportData = {};
  const consume = (record: string) => {
    const event = record.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = record.match(/^data:\s*(.+)$/m)?.[1];
    if (!event || !data) return;
    let parsed: (AssistantTransportData & { text?: string }) | { text?: string };
    try {
      parsed = JSON.parse(data) as AssistantTransportData & { text?: string };
    } catch {
      return;
    }
    if (event === "delta" && "text" in parsed && typeof parsed.text === "string") {
      reply += parsed.text;
      onDelta(parsed.text);
    } else if (event === "pending_action") {
      pendingAction = parsed as PendingAction;
    } else if (event === "done") {
      done = parsed as AssistantTransportData;
    }
  };
  while (true) {
    const { done: finished, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !finished });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (finished) break;
  }
  return { ...done, reply, pendingAction };
}

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
export type AssistantConversationOptions = {
  /** When set, messages are stored separately from the main portal assistant thread. */
  storageScope?: string;
};

export function useAssistantConversation(endpoint: string, options: AssistantConversationOptions = {}) {
  const storageScope = options.storageScope?.trim() || undefined;
  const multiThread = !storageScope;
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** traceId -> the rating this user gave it, so the control reflects the choice. */
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [activeThreadId, setActiveThreadId] = useState("");
  const [threads, setThreads] = useState<AssistantChatThreadSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChatHydrated(false);
    setHistoryOpen(false);
    if (multiThread) {
      const state = loadAssistantThreadState(endpoint);
      setActiveThreadId(state.activeThreadId);
      setThreads(state.threads);
      setMessages(state.messages);
    } else {
      setActiveThreadId("");
      setThreads([]);
      setMessages(loadAssistantChatMessages(endpoint, storageScope));
    }
    setLastTools([]);
    setPendingAction(null);
    setError(null);
    setChatHydrated(true);
  }, [endpoint, multiThread, storageScope]);

  useEffect(() => {
    if (!chatHydrated) return;
    if (multiThread && activeThreadId) {
      setThreads(persistAssistantThreadMessages(endpoint, activeThreadId, messages));
    } else if (!multiThread) {
      saveAssistantChatMessages(endpoint, messages, storageScope);
    }
  }, [activeThreadId, chatHydrated, endpoint, messages, multiThread, storageScope]);

  const send = useCallback(
    async (prompt?: string) => {
      const text = userMessageContentFromInput(prompt ?? input, attachments);
      if (!text || loading) return;
      setError(null);
      let hadPending = false;
      setPendingAction((prev) => {
        hadPending = prev !== null;
        return null;
      });
      const attachmentPayload = attachmentsToApiPayload(attachments);
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      const sentAttachments = attachments;
      setAttachments([]);
      setLoading(true);
      setLastTools([]);
      let streamingAssistant = false;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ messages: next, ...attachmentPayload }),
        });
        const data = await readAssistantTransport(res, (text) => {
          setMessages((current) => {
            if (!streamingAssistant) {
              streamingAssistant = true;
              return [...current, { role: "assistant", content: text }];
            }
            const last = current.length - 1;
            return current.map((message, index) =>
              index === last && message.role === "assistant"
                ? { ...message, content: message.content + text }
                : message,
            );
          });
        });
        if (!res.ok || data.error) {
          setError(data.error ?? "Something went wrong.");
          setAttachments(sentAttachments);
        } else {
          if (!streamingAssistant) {
            setMessages((m) => [
              ...m,
              { role: "assistant", content: data.reply ?? "", ...(data.traceId ? { traceId: data.traceId } : {}) },
            ]);
          } else if (data.traceId) {
            // Stream already rendered the reply; attach the Langfuse id for rating.
            setMessages((current) => {
              const last = current.length - 1;
              return current.map((message, index) =>
                index === last && message.role === "assistant"
                  ? { ...message, traceId: data.traceId }
                  : message,
              );
            });
          }
          setLastTools(data.toolTrace ?? []);
          setPendingAction(data.pendingAction ?? null);
          // A freshly proposed draft (or one that was cleared by re-asking) should
          // refresh the dashboard's AI-drafts chips on the same tick.
          if (data.pendingAction || hadPending) notifyAgentPendingActionsChanged();
        }
      } catch {
        setError("Network error.");
        setAttachments(sentAttachments);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, input, loading, messages, attachments],
  );

  /** Confirm or cancel the proposed action; either way the outcome is appended
   * to the conversation so the next turn stays coherent. Confirm routes through
   * the server's `claimPendingAction` re-validation — never a client-side send. */
  const resolvePendingAction = useCallback(
    async (decision: "confirm" | "deny") => {
      if (!pendingAction || loading) return;
      const confirmedKind = pendingAction.preview.kind;
      const listingIdForRefresh = pendingAction.preview.fields
        .find((f) => f.label === "Listing id")
        ?.value?.trim();
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
          if (
            decision === "confirm" &&
            confirmedKind === "apply_listing_photos" &&
            listingIdForRefresh
          ) {
            notifyListingAssistantUpdated({ propertyId: listingIdForRefresh, tool: "apply_listing_photos" });
          }
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
    attachments.forEach(revokeAttachmentPreview);
    if (multiThread) {
      const next = startNewAssistantThread(endpoint, activeThreadId, messages);
      setActiveThreadId(next.activeThreadId);
      setThreads(next.threads);
      setMessages(next.messages);
    } else {
      setMessages([]);
      clearAssistantChatMessages(endpoint, storageScope);
    }
    setLastTools([]);
    setPendingAction(null);
    setError(null);
    setInput("");
    setAttachments([]);
    setHistoryOpen(false);
  }, [activeThreadId, attachments, endpoint, messages, multiThread, storageScope]);

  const openHistory = useCallback(() => {
    if (!multiThread) return;
    setHistoryOpen(true);
  }, [multiThread]);

  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  const selectThread = useCallback(
    (threadId: string) => {
      if (!multiThread) return;
      const next = switchAssistantThread(endpoint, threadId, { id: activeThreadId, messages });
      setActiveThreadId(next.activeThreadId);
      setMessages(next.messages);
      setThreads(next.threads);
      setPendingAction(null);
      setLastTools([]);
      setError(null);
    },
    [activeThreadId, endpoint, messages, multiThread],
  );

  /**
   * Rate one assistant turn. Optimistic: the button state is local and the
   * score is fire-and-forget, because a rating is a nice-to-have signal and
   * blocking the UI on it (or surfacing an error toast) would cost more
   * feedback than the occasional lost score does. Returns whether it stuck so a
   * caller that wants to react can.
   */
  const submitFeedback = useCallback(
    async (traceId: string, rating: "up" | "down"): Promise<boolean> => {
      if (!traceId) return false;
      setRatings((r) => ({ ...r, [traceId]: rating }));
      try {
        const res = await fetch("/api/agent/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceId, rating }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  const startNewChat = useCallback(() => {
    reset();
    requestAnimationFrame(() => {
      /* focus handled by caller */
    });
  }, [reset]);

  return {
    input,
    setInput,
    attachments,
    setAttachments,
    messages,
    threads,
    activeThreadId,
    historyOpen,
    multiThread,
    lastTools,
    pendingAction,
    loading,
    error,
    setError,
    ratings,
    submitFeedback,
    send,
    resolvePendingAction,
    reset,
    openHistory,
    closeHistory,
    selectThread,
    startNewChat,
  } as const;
}
