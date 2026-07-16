/**
 * Persistence for proposed-but-unconfirmed write actions. A write tool call
 * from the model produces one row here (via the chat routes); the client only
 * ever holds the row's opaque id. Confirming claims the row atomically
 * (exactly-once, expiry-checked) and executes against the stored, re-validated
 * input. Cancelled/expired proposals are kept — they feed the eval set.
 */
import type { ActionPreview } from "./registry";

export type AgentPortal = "manager" | "resident" | "vendor";

/** Minimal actor surface; all three portal contexts satisfy it. */
export type PendingActionActor = {
  userId: string;
  /** Manager id for manager-portal actions; undefined otherwise. */
  landlordId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

/** The wire shape sent to the client. Never includes the raw tool input. */
export type PendingAction = {
  id: string;
  toolName: string;
  destructive: boolean;
  expiresAt: string; // ISO
  preview: ActionPreview;
  /** Demo surfaces set this; the confirm button shows a canned reply instead. */
  simulated?: boolean;
};

export type PendingActionRow = {
  id: string;
  actor_user_id: string;
  portal: AgentPortal;
  landlord_id: string | null;
  session_id: string | null;
  tool_name: string;
  input: unknown;
  preview: ActionPreview & { destructive?: boolean };
  status: string;
  created_at: string;
  expires_at: string;
};

export const PENDING_ACTION_TTL_MS = 10 * 60_000;

/**
 * Persist a proposal and supersede any other pending proposals for this actor,
 * so at most one confirm card is ever live per user.
 */
export async function persistPendingAction(
  actor: PendingActionActor,
  args: {
    portal: AgentPortal;
    sessionId?: string | null;
    toolName: string;
    input: unknown;
    preview: ActionPreview;
    destructive: boolean;
  },
): Promise<PendingAction | null> {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString();

  try {
    await actor.db
      .from("agent_pending_actions")
      .update({ status: "superseded", resolved_at: nowIso })
      .eq("actor_user_id", actor.userId)
      .eq("status", "pending");

    const { data, error } = await actor.db
      .from("agent_pending_actions")
      .insert({
        actor_user_id: actor.userId,
        portal: args.portal,
        landlord_id: actor.landlordId ?? null,
        session_id: args.sessionId ?? null,
        tool_name: args.toolName,
        input: args.input,
        preview: { ...args.preview, destructive: args.destructive },
        status: "pending",
        created_at: nowIso,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error || !data?.id) return null;

    return {
      id: String(data.id),
      toolName: args.toolName,
      destructive: args.destructive,
      expiresAt,
      preview: args.preview,
    };
  } catch {
    return null;
  }
}

export type ClaimResult =
  | { ok: true; row: PendingActionRow }
  | { ok: false; reason: "not_found" | "already_resolved" | "expired" };

/**
 * Atomically claim a pending action for confirmation or cancellation. The
 * UPDATE's WHERE clause is the entire security story: it matches only rows
 * owned by this actor, still pending, and not expired — so a double confirm,
 * a foreign user's id, or a stale card can never execute.
 */
export async function claimPendingAction(
  actor: PendingActionActor,
  actionId: string,
  decision: "confirm" | "cancel",
): Promise<ClaimResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await actor.db
    .from("agent_pending_actions")
    .update({ status: decision === "confirm" ? "confirmed" : "cancelled", resolved_at: nowIso })
    .eq("id", actionId)
    .eq("actor_user_id", actor.userId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (!error && data) return { ok: true, row: data as PendingActionRow };

  // Zero rows claimed: one scoped follow-up read to say why (still actor-scoped,
  // so foreign ids stay indistinguishable from unknown ids).
  const { data: existing } = await actor.db
    .from("agent_pending_actions")
    .select("id, status, expires_at")
    .eq("id", actionId)
    .eq("actor_user_id", actor.userId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === "pending" && String(existing.expires_at) <= nowIso) {
    return { ok: false, reason: "expired" };
  }
  return { ok: false, reason: "already_resolved" };
}
