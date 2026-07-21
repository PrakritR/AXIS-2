/**
 * Shared request handler for the role-scoped portal assistants (resident and
 * vendor). It is the same contract the manager `/api/agent/chat` route
 * implements — propose a write, persist it as a pending action, execute only on
 * an explicit confirm carrying nothing but the action id — factored out so the
 * three surfaces cannot drift apart on the security-relevant parts.
 *
 * The manager route keeps its own copy because it also carries the legacy
 * work-order dispatch confirm shape, which is manager-only.
 */
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "@/lib/tools/context";
import type { ToolRegistry } from "@/lib/tools/registry";
import {
  claimPendingAction,
  createPendingAction,
  denyPendingAction,
  markPendingActionFailed,
} from "@/lib/tools/pending-actions";
import { runAgentTurn } from "@/lib/agent/loop";
import { track } from "@/lib/analytics/posthog";
import { traceAgentAction, traceAgentTurn } from "@/lib/observability/langfuse";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Confirm path. The client sends ONLY the pending action id; the tool name and
 * input come from the server-stored proposal (Zod-validated at propose time,
 * re-validated here) and the handler re-resolves current state itself.
 */
async function confirmAction(ctx: AgentContext, registry: ToolRegistry, actionId: string) {
  const claimed = await claimPendingAction(ctx, actionId);
  if (!claimed) {
    return NextResponse.json(
      { error: "This action is no longer available. Ask the assistant again." },
      { status: 410 },
    );
  }
  const tool = registry.get(claimed.toolName);
  const parsed = tool?.kind === "write" ? tool.inputSchema.safeParse(claimed.input) : null;
  if (!tool || !parsed?.success) {
    await markPendingActionFailed(ctx, actionId);
    return NextResponse.json({ error: "This action could not be executed." }, { status: 400 });
  }
  try {
    const result = (await traceAgentAction(
      ctx,
      claimed.toolName,
      { actionId, toolInput: parsed.data },
      () => tool.handler(ctx, parsed.data),
    )) as { reply?: string };
    track("assistant_action_confirmed", ctx.userId, { action: claimed.toolName });
    return NextResponse.json({
      reply: result.reply ?? "Done.",
      toolTrace: [{ tool: claimed.toolName, ok: true }],
    });
  } catch (e) {
    console.error("[agent/portal-chat] confirm action failed:", e);
    // The claim already flipped the row to "executed"; record the truth. The
    // user re-asks for a fresh proposal (no blind retry of a possibly
    // partially-executed handler).
    await markPendingActionFailed(ctx, actionId);
    const message = e instanceof Error ? e.message : "The assistant ran into an error. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function handlePortalAgentChat(opts: {
  req: Request;
  /** Role-scoped context resolver. Returning null yields a 401. */
  resolveContext: () => Promise<AgentContext | null>;
  registry: ToolRegistry;
  system: string;
  /** Role label for analytics only — never a scope key. */
  surface: "resident" | "vendor";
}): Promise<Response> {
  const ctx = await opts.resolveContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await opts.req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (typeof body.confirmActionId === "string") {
    return confirmAction(ctx, opts.registry, body.confirmActionId);
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
      runAgentTurn({ ctx, registry: opts.registry, messages, observer, system: opts.system }),
    );
    track("assistant_message_sent", ctx.userId, {
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
      surface: opts.surface,
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
    console.error("[agent/portal-chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
