/**
 * The confirm/deny branch every portal chat route shares.
 *
 * The client posts ONLY `{ confirmActionId }` or `{ denyActionId }` back to the
 * same auth-gated chat endpoint it proposed from. Nothing else in the body is
 * read: the tool name and its input come from the server-stored proposal
 * (Zod-validated at propose time, re-validated at confirm time), and the
 * handler re-resolves current state itself.
 *
 * Factored out so the three surfaces cannot drift apart on the
 * security-relevant parts.
 */
import { NextResponse } from "next/server";
import {
  runConfirmedPendingActionForPortal,
  type ConfirmGateResult,
} from "@/lib/tools/confirm-gate.server";
import {
  denyPendingAction,
  type AgentPortal,
  type PendingActionActor,
} from "@/lib/tools/pending-actions";
import type { ToolRegistry } from "@/lib/tools/registry";
import { appendAgentMessages } from "@/lib/agent/sessions";
import { track } from "@/lib/analytics/posthog";

type DecisionActor = PendingActionActor & { landlordId: string };

/**
 * Handle a confirm/deny body, or return null when the request is an ordinary
 * chat turn. Callers must invoke this BEFORE running a model turn.
 */
export async function handlePendingActionDecision<Ctx extends DecisionActor>(args: {
  body: Record<string, unknown>;
  ctx: Ctx;
  registry: ToolRegistry<Ctx>;
  portal: AgentPortal;
  traceMetadata?: Record<string, unknown>;
}): Promise<NextResponse | null> {
  const { body, ctx, registry, portal } = args;

  if (typeof body.denyActionId === "string") {
    const denied = await denyPendingAction(ctx, body.denyActionId);
    track("assistant_action_denied", ctx.userId, { portal, known: denied });
    return NextResponse.json({ reply: "Okay, cancelled. Nothing was sent or changed." });
  }

  if (typeof body.confirmActionId !== "string") return null;

  let result: ConfirmGateResult;
  try {
    result = await runConfirmedPendingActionForPortal(
      ctx,
      registry,
      portal,
      body.confirmActionId,
      args.traceMetadata ?? { portal },
    );
  } catch (e) {
    console.error(`[agent/${portal}] confirm action failed:`, e);
    return NextResponse.json(
      { error: "The assistant ran into an error. Please try again." },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  track("assistant_action_confirmed", ctx.userId, { portal, action: result.toolName });
  appendAgentMessages(ctx, portal, result.sessionId, [
    { role: "assistant", content: result.reply, toolTrace: { tools: [{ tool: result.toolName, ok: true }] } },
  ]);
  return NextResponse.json({
    reply: result.reply,
    toolTrace: [{ tool: result.toolName, ok: true }],
    ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
  });
}
