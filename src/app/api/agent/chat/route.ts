import { NextResponse } from "next/server";
import { resolveAgentContext } from "@/lib/tools/context";
import { agentRegistry, MANAGER_INLINE_WRITE_TOOLS } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import type { ActionPreview } from "@/lib/tools/registry";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { sanitizeChatMessages, lastUserText, applyChatAttachments } from "@/lib/agent/chat-handler";
import { createPendingAction } from "@/lib/tools/pending-actions";
import { handlePendingActionDecision } from "@/lib/agent/pending-action-decision";
import { ensureAgentSession, appendAgentMessages } from "@/lib/agent/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";
import { enrichManagerChatImageAttachments } from "@/lib/listing-draft-agent.server";
import {
  assistantContextHintFromMessages,
  isListingDraftAssistantContext,
  isPromotionAssistantContext,
} from "@/lib/agent/assistant-turn-context";
import {
  formatAgentChatUserError,
  PENDING_ACTION_SAVE_FAILED_NOTE,
} from "@/lib/agent/assistant-turn-error";
import { messagesNeedVisionModel, visionPinnedModel } from "@/lib/agent/assistant-vision-turn";

export const runtime = "nodejs";

/**
 * Manager-portal assistant turn. Write tools are exposed to the model but a
 * proposal never executes here: the loop halts, the proposal is persisted, and
 * it executes only when the user confirms — by posting the action id back to
 * THIS endpoint (`handlePendingActionDecision` → the one confirm gate). There
 * is no separate confirm route; never add a second one.
 *
 * The single exception is `MANAGER_INLINE_WRITE_TOOLS`: low-risk inbox
 * housekeeping this surface allow-lists so it runs inline like a read. No tool
 * can opt itself out of the gate — only a surface can allow-list one.
 */
export async function POST(req: Request) {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!rateLimit(`agent-chat:${ctx.userId}`, 20, 60_000).ok) {
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
    registry: agentRegistry,
    portal: "manager",
    traceMetadata: { landlordId: ctx.landlordId, role: "manager" },
  });
  if (decision) return decision;

  let messages = sanitizeChatMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  const attached = applyChatAttachments(messages, body);
  if (!attached.ok) return NextResponse.json({ error: attached.error }, { status: 400 });
  messages = attached.messages;
  if (attached.imageCount > 0) {
    const contextHint = assistantContextHintFromMessages(messages);
    const listingDraft = isListingDraftAssistantContext(contextHint);
    const promotion = isPromotionAssistantContext(contextHint);
    try {
      messages = await enrichManagerChatImageAttachments(ctx.db, ctx.landlordId, messages, {
        requireSuccessfulUpload: listingDraft,
        purpose: promotion ? "promotion" : "listing",
      });
    } catch (e) {
      console.error("[agent/chat] listing photo upload failed:", e);
      return NextResponse.json(
        { error: "We could not save your photos. Try again or use smaller images." },
        { status: 500 },
      );
    }
  }

  const sessionId = await ensureAgentSession(ctx, "manager", body.sessionId as string | undefined);

  try {
    const traceActor = {
      userId: ctx.userId,
      sessionId: sessionId ?? undefined,
      metadata: { landlordId: ctx.landlordId, role: "manager" },
    };
    const result = await traceAgentTurn(
      traceActor,
      messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "[image message]" })),
      (observer) =>
        runAgentTurn({
          ctx,
          registry: agentRegistry,
          system: SYSTEM_PROMPT,
          messages,
          observer,
          allowWriteTools: MANAGER_INLINE_WRITE_TOOLS,
          ...(messagesNeedVisionModel(messages) ? { model: visionPinnedModel() } : {}),
        }),
    );
    track("assistant_message_sent", ctx.userId, {
      portal: "manager",
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
      images: attached.imageCount,
      documents: attached.documentCount,
    });

    // A proposal is persisted server-side; the client only ever receives the
    // opaque id and the preview it can confirm or deny. The stored input never
    // leaves the server.
    const proposal = result.pendingAction;
    let pendingAction: { id: string; preview: ActionPreview } | null = null;
    let reply = result.reply;
    if (proposal) {
      const actionId = await createPendingAction(ctx, proposal.toolName, proposal.input, proposal.preview, {
        portal: "manager",
        sessionId,
      });
      if (actionId) {
        pendingAction = { id: actionId, preview: proposal.preview };
        track("assistant_action_proposed", ctx.userId, {
          portal: "manager",
          tool: proposal.toolName,
          batch: proposal.preview.batchCount ?? 1,
        });
      } else {
        reply = reply.trim() ? `${reply.trim()}\n\n${PENDING_ACTION_SAVE_FAILED_NOTE}` : PENDING_ACTION_SAVE_FAILED_NOTE;
      }
    }

    appendAgentMessages(ctx, "manager", sessionId, [
      { role: "user", content: lastUserText(messages) },
      {
        role: "assistant",
        content: reply,
        toolTrace: {
          tools: result.toolTrace,
          model: result.model,
          tier: result.tier,
          ...(proposal ? { pendingAction: { toolName: proposal.toolName } } : {}),
        },
      },
    ]);

    return NextResponse.json({
      reply,
      toolTrace: result.toolTrace,
      sessionId,
      ...(pendingAction ? { pendingAction } : {}),
    });
  } catch (e) {
    console.error("[agent/chat] turn failed:", e);
    const { message, httpStatus } = formatAgentChatUserError(e);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
