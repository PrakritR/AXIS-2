import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveAgentContext, type AgentContext } from "@/lib/tools/context";
import { agentRegistry } from "@/lib/tools";
import {
  claimPendingAction,
  createPendingAction,
  denyPendingAction,
  markPendingActionFailed,
} from "@/lib/tools/pending-actions";
import { runAgentTurn } from "@/lib/agent/loop";
import { track } from "@/lib/analytics/posthog";
import { traceAgentAction, traceAgentTurn } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Confirm path for a proposed write action. The client sends ONLY the pending
 * action id; the tool name and input come from the server-stored proposal
 * (Zod-validated at propose time, re-validated here), and the tool handler
 * re-resolves current state itself. Client- or model-supplied arguments are
 * never trusted at confirm time.
 */
async function confirmAction(ctx: AgentContext, actionId: string) {
  const claimed = await claimPendingAction(ctx, actionId);
  if (!claimed) {
    return NextResponse.json(
      { error: "This action is no longer available. Ask the assistant again." },
      { status: 410 },
    );
  }
  const tool = agentRegistry.get(claimed.toolName);
  const parsed = tool?.kind === "write" ? tool.inputSchema.safeParse(claimed.input) : null;
  if (!tool || !parsed?.success) {
    await markPendingActionFailed(ctx, actionId);
    return NextResponse.json({ error: "This action could not be executed." }, { status: 400 });
  }
  try {
    const result = (await traceAgentAction(ctx, claimed.toolName, { actionId, toolInput: parsed.data }, () =>
      tool.handler(ctx, parsed.data),
    )) as { reply?: string };
    track("assistant_action_confirmed", ctx.userId, { action: claimed.toolName });
    return NextResponse.json({
      reply: result.reply ?? "Done.",
      toolTrace: [{ tool: claimed.toolName, ok: true }],
    });
  } catch (e) {
    console.error("[agent/chat] confirm action failed:", e);
    // The claim already flipped the row to "executed"; record the truth. The
    // user re-asks the assistant for a fresh proposal (no blind retry of a
    // possibly partially-executed handler).
    await markPendingActionFailed(ctx, actionId);
    const message = e instanceof Error ? e.message : "The assistant ran into an error. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (typeof body.confirmActionId === "string") {
    return confirmAction(ctx, body.confirmActionId);
  }

  if (typeof body.denyActionId === "string") {
    const denied = await denyPendingAction(ctx, body.denyActionId);
    track("assistant_action_denied", ctx.userId, { known: denied });
    return NextResponse.json({ reply: "Okay, cancelled. Nothing was sent or changed." });
  }

  const rawMessages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const messages: Anthropic.MessageParam[] = rawMessages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  try {
    const result = await traceAgentTurn(ctx, messages as ChatMessage[], (observer) =>
      runAgentTurn({ ctx, registry: agentRegistry, messages, observer }),
    );
    track("assistant_message_sent", ctx.userId, {
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
    });

    if (result.pendingAction) {
      const actionId = await createPendingAction(
        ctx,
        result.pendingAction.toolName,
        result.pendingAction.input,
        result.pendingAction.preview,
      );
      if (actionId) {
        track("assistant_action_proposed", ctx.userId, { action: result.pendingAction.toolName });
        return NextResponse.json({
          reply: result.reply,
          toolTrace: result.toolTrace,
          model: result.model,
          tier: result.tier,
          usage: result.usage,
          // The stored input never leaves the server; the client only sees the
          // preview and the id it can confirm or deny.
          pendingAction: { id: actionId, preview: result.pendingAction.preview },
        });
      }
      return NextResponse.json({
        reply: "I prepared an action but couldn't save it for confirmation. Please try again.",
        toolTrace: result.toolTrace,
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[agent/chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
