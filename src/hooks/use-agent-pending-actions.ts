"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AGENT_PENDING_ACTIONS_EVENT,
  notifyAgentPendingActionsChanged,
} from "@/lib/axis-assistant/pending-actions-events";
import {
  normalizePendingActions,
  type PendingActionListItem,
} from "@/lib/axis-assistant/pending-action-display";

/**
 * Load the signed-in manager's open agent-proposed write actions for the
 * dashboard "AI drafts" chips, and expose an approve/discard that routes through
 * the SAME gated `/api/agent/chat` confirm path the assistant uses
 * (`claimPendingAction` re-validates the stored input server-side — the client
 * only ever sends the action id). There is no client-side execute here.
 *
 * Refetches on mount and whenever any assistant surface fires
 * {@link AGENT_PENDING_ACTIONS_EVENT} (a draft proposed in the dock/popup, or an
 * approval/discard elsewhere), so the chips track live server state.
 */
export function useAgentPendingActions({
  enabled,
  endpoint = "/api/agent/chat",
  listEndpoint = "/api/agent/pending-actions",
}: {
  enabled: boolean;
  endpoint?: string;
  listEndpoint?: string;
}) {
  const [items, setItems] = useState<PendingActionListItem[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    try {
      const res = await fetch(listEndpoint, { credentials: "include" });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as unknown;
      setItems(normalizePendingActions(data));
    } catch {
      setItems([]);
    }
  }, [enabled, listEndpoint]);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear chips when the surface turns off
      setItems([]);
      return;
    }
    void refetch();
    const onChange = () => void refetch();
    window.addEventListener(AGENT_PENDING_ACTIONS_EVENT, onChange);
    return () => window.removeEventListener(AGENT_PENDING_ACTIONS_EVENT, onChange);
  }, [enabled, refetch]);

  /** Approve (confirm) or discard (deny) one draft via the gated confirm route. */
  const resolve = useCallback(
    async (id: string, decision: "confirm" | "deny"): Promise<{ ok: boolean; error?: string }> => {
      if (!id || resolvingId) return { ok: false };
      setResolvingId(id);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            decision === "confirm" ? { confirmActionId: id } : { denyActionId: id },
          ),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        // Optimistically drop the row; the confirm route already claimed it
        // atomically server-side, so a stale chip should not linger.
        setItems((prev) => prev.filter((it) => it.id !== id));
        // Let the dock/popup (and other tabs) reconcile their own view.
        notifyAgentPendingActionsChanged();
        if (!res.ok || data.error) return { ok: false, error: data.error ?? "Could not complete that action." };
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error." };
      } finally {
        setResolvingId(null);
      }
    },
    [endpoint, resolvingId],
  );

  return { items, resolve, resolvingId, refetch } as const;
}
