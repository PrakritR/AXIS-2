/**
 * Server-side persistence for proposed write actions. The confirm request
 * carries ONLY a row id; the stored input (validated at propose time and
 * re-validated at confirm time) is what executes — model/client-supplied
 * arguments are never trusted at confirm time. The atomic status flip
 * (proposed -> executed/denied) is the replay guard.
 */
import type { AgentContext } from "./context";
import type { ActionPreview } from "./registry";

export async function createPendingAction(
  ctx: AgentContext,
  toolName: string,
  input: unknown,
  preview: ActionPreview,
): Promise<string | null> {
  const { data, error } = await ctx.db
    .from("agent_pending_actions")
    .insert({
      landlord_id: ctx.landlordId,
      user_id: ctx.userId,
      tool_name: toolName,
      input,
      preview,
    })
    .select("id")
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function resolvePendingAction(
  ctx: AgentContext,
  id: string,
  status: "executed" | "denied",
): Promise<{ toolName: string; input: unknown } | null> {
  const actionId = String(id ?? "").trim();
  if (!actionId) return null;
  // Single atomic update: only a still-proposed, unexpired row owned by this
  // landlord flips. A concurrent double-confirm loses the race and gets null.
  const { data, error } = await ctx.db
    .from("agent_pending_actions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("landlord_id", ctx.landlordId)
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
    .eq("landlord_id", ctx.landlordId)
    .eq("status", "executed");
}
