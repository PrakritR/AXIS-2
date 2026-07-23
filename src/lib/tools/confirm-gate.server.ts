/**
 * The one confirm-gate executor: claim a proposed action, re-look-up the tool
 * from the manager registry, re-validate the STORED input against the tool's
 * Zod schema, and run the handler. Client/model-supplied arguments are never
 * trusted at confirm time — only the id is. Shared by the chat confirm route
 * and the standalone tour-proposal approval route so both go through exactly
 * the same gate.
 */
import type { AgentContext } from "./context";
import { agentRegistry } from "./index";
import { claimPendingAction, markPendingActionFailed } from "./pending-actions";
import { traceAgentAction } from "@/lib/observability/langfuse";

export type ConfirmGateResult =
  | { ok: true; reply: string; toolName: string }
  | { ok: false; status: number; error: string };

export async function runConfirmedPendingAction(ctx: AgentContext, actionId: string): Promise<ConfirmGateResult> {
  const claimed = await claimPendingAction(ctx, actionId);
  if (!claimed) {
    return { ok: false, status: 410, error: "This action is no longer available. Ask the assistant again." };
  }
  const tool = agentRegistry.get(claimed.toolName);
  const parsed = tool?.kind === "write" ? tool.inputSchema.safeParse(claimed.input) : null;
  if (!tool || !parsed?.success) {
    await markPendingActionFailed(ctx, actionId);
    return { ok: false, status: 400, error: "This action could not be executed." };
  }
  try {
    const result = (await traceAgentAction(ctx, claimed.toolName, { actionId, toolInput: parsed.data }, () =>
      tool.handler(ctx, parsed.data),
    )) as { reply?: string };
    return { ok: true, reply: result.reply ?? "Done.", toolName: claimed.toolName };
  } catch (e) {
    // The claim already flipped the row to "executed"; record the truth. The
    // user re-asks for a fresh proposal (no blind retry of a possibly
    // partially-executed handler).
    await markPendingActionFailed(ctx, actionId);
    const message = e instanceof Error ? e.message : "The assistant ran into an error. Please try again.";
    return { ok: false, status: 400, error: message };
  }
}
