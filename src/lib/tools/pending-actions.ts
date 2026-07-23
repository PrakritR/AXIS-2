/**
 * Server-side persistence for proposed write actions. The confirm request
 * carries ONLY a row id; the stored input (validated at propose time and
 * re-validated at confirm time) is what executes — model/client-supplied
 * arguments are never trusted at confirm time. The atomic status flip
 * (proposed -> executed/denied) is the replay guard.
 */
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { AgentContext } from "./context";
import type { ActionPreview } from "./registry";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Insert a proposed action for a specific actor, service-role only. Used both by
 * the model-loop path (via {@link createPendingAction}) and by system-initiated
 * proposals that have no live AgentContext — e.g. the approval-first tour
 * confirmation generated when a new inquiry arrives on a public route. Those
 * async, inbox-style proposals pass a longer `expiresInMs` than a live chat
 * turn's 15-minute default.
 */
export async function createPendingActionForUser(
  db: Db,
  args: {
    landlordId: string;
    userId: string;
    toolName: string;
    input: unknown;
    preview: ActionPreview;
    expiresInMs?: number;
  },
): Promise<string | null> {
  const row: Record<string, unknown> = {
    // `landlord_id` is `uuid not null`. A manager's landlordId is their own id;
    // a resident's is their linked manager. A vendor (and an unlinked resident)
    // has no landlord, so the row is anchored to the actor instead — `user_id`
    // is what actually gates the claim below.
    landlord_id: args.landlordId || args.userId,
    user_id: args.userId,
    tool_name: args.toolName,
    input: args.input,
    preview: args.preview,
  };
  if (args.expiresInMs && args.expiresInMs > 0) {
    row.expires_at = new Date(Date.now() + args.expiresInMs).toISOString();
  }
  const { data, error } = await db.from("agent_pending_actions").insert(row).select("id").single();
  if (error || !data?.id) return null;
  return String(data.id);
}

export async function createPendingAction(
  ctx: AgentContext,
  toolName: string,
  input: unknown,
  preview: ActionPreview,
): Promise<string | null> {
  return createPendingActionForUser(ctx.db, {
    landlordId: ctx.landlordId || ctx.userId,
    userId: ctx.userId,
    toolName,
    input,
    preview,
  });
}

export type ProposedAction = { id: string; input: unknown; preview: ActionPreview; createdAt: string };

/**
 * Every still-open proposal of one tool for one actor, newest first. Scoped on
 * `user_id` (the claim key) so a manager only ever sees their own approvals.
 */
export async function listProposedActionsForUser(
  db: Db,
  args: { userId: string; toolName: string },
): Promise<ProposedAction[]> {
  const { data, error } = await db
    .from("agent_pending_actions")
    .select("id, input, preview, created_at")
    .eq("user_id", args.userId)
    .eq("tool_name", args.toolName)
    .eq("status", "proposed")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as { id: string; input: unknown; preview: ActionPreview; created_at: string }[]).map((row) => ({
    id: String(row.id),
    input: row.input,
    preview: row.preview,
    createdAt: String(row.created_at ?? ""),
  }));
}

async function resolvePendingAction(
  ctx: AgentContext,
  id: string,
  status: "executed" | "denied",
): Promise<{ toolName: string; input: unknown } | null> {
  const actionId = String(id ?? "").trim();
  if (!actionId) return null;
  // Single atomic update: only a still-proposed, unexpired row owned by this
  // ACTOR flips. A concurrent double-confirm loses the race and gets null.
  // `user_id` (not `landlord_id`) is the ownership key: two residents of the
  // same manager share a landlord_id, so filtering on it alone would let one
  // confirm the other's pending action.
  const { data, error } = await ctx.db
    .from("agent_pending_actions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("user_id", ctx.userId)
    .eq("status", "proposed")
    .gt("expires_at", new Date().toISOString())
    .select("tool_name, input");
  const row = (data ?? [])[0] as { tool_name: string; input: unknown } | undefined;
  if (error || !row) return null;
  return { toolName: String(row.tool_name), input: row.input };
}

/** Claim a proposed action for execution. Null = unknown/foreign/expired/replayed. */
export function claimPendingAction(ctx: AgentContext, id: string) {
  return resolvePendingAction(ctx, id, "executed");
}

/** Mark a proposed action as denied. Same guards as claiming. */
export async function denyPendingAction(ctx: AgentContext, id: string): Promise<boolean> {
  return (await resolvePendingAction(ctx, id, "denied")) !== null;
}

/**
 * Record that a claimed action's execution threw, so the row doesn't falsely
 * read "executed". Deliberately NOT reverted to "proposed": a handler may have
 * partially executed, and re-running it must go through a fresh proposal.
 */
export async function markPendingActionFailed(ctx: AgentContext, id: string): Promise<void> {
  await ctx.db
    .from("agent_pending_actions")
    .update({ status: "failed" })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("status", "executed");
}
