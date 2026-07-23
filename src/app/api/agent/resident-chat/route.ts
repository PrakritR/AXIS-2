import { NextResponse } from "next/server";
import { resolveResidentAgentContext } from "@/lib/tools/resident-context";
import { buildResidentRegistry } from "@/lib/tools/resident-index";
import { runAgentTurn } from "@/lib/agent/loop";
import type { ActionPreview } from "@/lib/tools/registry";
import { RESIDENT_SYSTEM_PROMPT } from "@/lib/agent/resident-system-prompt";
import { sanitizeChatMessages, lastUserText } from "@/lib/agent/chat-handler";
import { createPendingAction } from "@/lib/tools/pending-actions";
import { handlePendingActionDecision } from "@/lib/agent/pending-action-decision";
import { ensureAgentSession, appendAgentMessages } from "@/lib/agent/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

/**
 * Resident-portal assistant turn. Same loop and gating as the manager chat,
 * against the resident-scoped registry: every tool self-scopes to the
 * authenticated resident's own records, and write proposals only execute when
 * the user posts the action id back to THIS endpoint (the one confirm gate,
 * portal-bound to "resident"). There is no separate confirm route.
 */
export async function POST(req: Request) {
  const ctx = await resolveResidentAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!rateLimit(`resident-chat:${ctx.userId}`, 20, 300_000).ok) {
    return NextResponse.json(
      { error: "You're sending messages a little fast — please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Confirm / deny of an earlier proposal: the body carries ONLY the action id.
  // The stored input is re-validated and the handler re-resolves state itself.
  const decision = await handlePendingActionDecision({
    body,
    ctx,
    registry: buildResidentRegistry(ctx),
    portal: "resident",
    traceMetadata: { role: "resident", managerIds: ctx.managerIds, phase: ctx.phase },
  });
  if (decision) return decision;

  const messages = sanitizeChatMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  const sessionId = await ensureAgentSession(ctx, "resident", body.sessionId as string | undefined);

  try {
    const registry = buildResidentRegistry(ctx);
    const traceActor = {
      userId: ctx.userId,
      sessionId: sessionId ?? undefined,
      metadata: { role: "resident", managerIds: ctx.managerIds, phase: ctx.phase },
    };
    const result = await traceAgentTurn(
      traceActor,
      messages.map((m) => ({ role: m.role, content: String(m.content) })),
      (observer) =>
        runAgentTurn({ ctx, registry, system: RESIDENT_SYSTEM_PROMPT, messages, observer }),
    );
    track("assistant_message_sent", ctx.userId, {
      portal: "resident",
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
    });

    // A proposal is persisted server-side; the client only ever receives the
    // opaque id and the preview it can confirm or deny. The stored input never
    // leaves the server.
    const proposal = result.pendingAction;
    let pendingAction: { id: string; preview: ActionPreview } | null = null;
    if (proposal) {
      const actionId = await createPendingAction(ctx, proposal.toolName, proposal.input, proposal.preview, {
        portal: "resident",
        sessionId,
      });
      if (actionId) {
        pendingAction = { id: actionId, preview: proposal.preview };
        track("assistant_action_proposed", ctx.userId, {
          portal: "resident",
          tool: proposal.toolName,
          batch: proposal.preview.batchCount ?? 1,
        });
      }
    }

    appendAgentMessages(ctx, "resident", sessionId, [
      { role: "user", content: lastUserText(messages) },
      {
        role: "assistant",
        content: result.reply,
        toolTrace: {
          tools: result.toolTrace,
          model: result.model,
          tier: result.tier,
          ...(proposal ? { pendingAction: { toolName: proposal.toolName } } : {}),
        },
      },
    ]);

    return NextResponse.json({
      reply: result.reply,
      toolTrace: result.toolTrace,
      sessionId,
      ...(pendingAction ? { pendingAction } : {}),
    });
  } catch (e) {
    console.error("[agent/resident-chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
