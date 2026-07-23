import { NextResponse } from "next/server";
import { resolveVendorAgentContext } from "@/lib/tools/vendor-context";
import { vendorAgentRegistry } from "@/lib/tools/vendor-index";
import { runAgentTurn } from "@/lib/agent/loop";
import type { ActionPreview } from "@/lib/tools/registry";
import { VENDOR_SYSTEM_PROMPT } from "@/lib/agent/vendor-system-prompt";
import { sanitizeChatMessages, lastUserText } from "@/lib/agent/chat-handler";
import { createPendingAction } from "@/lib/tools/pending-actions";
import { handlePendingActionDecision } from "@/lib/agent/pending-action-decision";
import { ensureAgentSession, appendAgentMessages } from "@/lib/agent/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

/**
 * Vendor-portal assistant turn. Same loop and gating as the manager chat,
 * against the vendor-scoped registry: every tool self-scopes to the
 * authenticated vendor's own records, and write proposals only execute when
 * the user posts the action id back to THIS endpoint (the one confirm gate,
 * portal-bound to "vendor"). There is no separate confirm route.
 */
export async function POST(req: Request) {
  const ctx = await resolveVendorAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!rateLimit(`vendor-chat:${ctx.userId}`, 20, 300_000).ok) {
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
    registry: vendorAgentRegistry,
    portal: "vendor",
    traceMetadata: { role: "vendor", managerIds: ctx.managerIds },
  });
  if (decision) return decision;

  const messages = sanitizeChatMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  const sessionId = await ensureAgentSession(ctx, "vendor", body.sessionId as string | undefined);

  try {
    const traceActor = {
      userId: ctx.userId,
      sessionId: sessionId ?? undefined,
      metadata: { role: "vendor", managerIds: ctx.managerIds },
    };
    const result = await traceAgentTurn(
      traceActor,
      messages.map((m) => ({ role: m.role, content: String(m.content) })),
      (observer) =>
        runAgentTurn({ ctx, registry: vendorAgentRegistry, system: VENDOR_SYSTEM_PROMPT, messages, observer }),
    );
    track("assistant_message_sent", ctx.userId, {
      portal: "vendor",
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
        portal: "vendor",
        sessionId,
      });
      if (actionId) {
        pendingAction = { id: actionId, preview: proposal.preview };
        track("assistant_action_proposed", ctx.userId, {
          portal: "vendor",
          tool: proposal.toolName,
          batch: proposal.preview.batchCount ?? 1,
        });
      }
    }

    appendAgentMessages(ctx, "vendor", sessionId, [
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
    console.error("[agent/vendor-chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
