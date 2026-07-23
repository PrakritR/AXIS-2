/**
 * Cross-surface signal that the manager's open `agent_pending_actions` set may
 * have changed — a new draft was proposed, or one was approved/discarded. The
 * dashboard's "AI drafts" attention group listens for it to refetch the list, so
 * a draft proposed in the docked/floating assistant shows up as a chip (and
 * disappears once approved or discarded from either surface).
 */
export const AGENT_PENDING_ACTIONS_EVENT = "axis:agent-pending-actions";

/** Fire the change signal (no-op on the server). */
export function notifyAgentPendingActionsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_PENDING_ACTIONS_EVENT));
  }
}
