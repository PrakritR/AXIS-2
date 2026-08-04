import { NextResponse } from "next/server";
import { resolveAgentContext } from "@/lib/tools/context";
import { agentRegistry, MANAGER_INLINE_WRITE_TOOLS } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import type { ActionPreview } from "@/lib/tools/registry";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { sanitizeChatMessages, lastUserText, applyChatAttachments } from "@/lib/agent/chat-handler";
import { createPendingAction } from "@/lib/tools/pending-actions";
import { handlePendingActionDecision } from "@/lib/agent/pending-action-decision";
import { createPortalChatSession, ensureAgentSession, appendAgentMessages } from "@/lib/agent/sessions";
import { handleAgentChatHistoryRequest } from "@/lib/agent/chat-history-route";
import { MODAL_CHAT_SESSION_KIND, PORTAL_CHAT_SESSION_KIND } from "@/lib/agent/chat-history";
import { loadAgentCustomInstructions, withAgentCustomInstructions } from "@/lib/agent/user-preferences";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";
import { enrichManagerChatDocumentAttachments, enrichManagerChatImageAttachments } from "@/lib/listing-draft-agent.server";
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
import { selectAgentRoute } from "@/lib/agent/model";
import { assistantResponse } from "@/lib/agent/assistant-stream";

export const runtime = "nodejs";

/** Manager/admin archive, scoped entirely from the authenticated context. */
export async function GET(req: Request) {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return handleAgentChatHistoryRequest(req, ctx, "manager");
}

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

  // New chat is a real, server-owned thread immediately — not a browser-only
  // reset that disappears from Past conversations until its first message.
  if (body.newSession === true) {
    const sessionId = await createPortalChatSession(ctx, "manager");
    if (!sessionId) {
      return NextResponse.json(
        { error: "We couldn't start a saved conversation. Please try again." },
        { status: 503 },
      );
    }
    return NextResponse.json({ sessionId });
  }

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
        contextHint,
      });
    } catch (e) {
      console.error("[agent/chat] listing photo upload failed:", e);
      return NextResponse.json(
        { error: "We could not save your photos. Try again or use smaller images." },
        { status: 500 },
      );
    }
  }
  if (attached.documentCount > 0) {
    const contextHint = assistantContextHintFromMessages(messages);
    try {
      messages = await enrichManagerChatDocumentAttachments(ctx.db, ctx.landlordId, messages, contextHint);
    } catch (e) {
      console.error("[agent/chat] lease template upload failed:", e);
      return NextResponse.json(
        { error: "We could not save your PDF. Try again or use a smaller file." },
        { status: 500 },
      );
    }
  }

  const sessionKind = body.archive === false ? MODAL_CHAT_SESSION_KIND : PORTAL_CHAT_SESSION_KIND;
  const sessionId = await ensureAgentSession(ctx, "manager", {
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    title: lastUserText(messages),
    kind: sessionKind,
  });
  if (sessionKind === PORTAL_CHAT_SESSION_KIND && !sessionId) {
    return NextResponse.json(
      { error: "We couldn't start a saved conversation. Please try again." },
      { status: 503 },
    );
  }
  const customInstructions = await loadAgentCustomInstructions(ctx.db, ctx.userId);

  try {
    const traceActor = {
      userId: ctx.userId,
      sessionId: sessionId ?? undefined,
      metadata: { landlordId: ctx.landlordId, role: "manager" },
    };
    const hasVision = messagesNeedVisionModel(messages);
    const routing = hasVision
      ? visionPinnedModel()
      : selectAgentRoute({
          messages,
          actorKey: ctx.userId,
          availableTools: [...agentRegistry.keys()],
        });
    const result = await traceAgentTurn(
      traceActor,
      messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "[image message]" })),
      (observer) =>
        runAgentTurn({
          ctx,
          registry: agentRegistry,
          system: withAgentCustomInstructions(SYSTEM_PROMPT, customInstructions),
          messages,
          observer,
          allowWriteTools: MANAGER_INLINE_WRITE_TOOLS,
          model: routing,
          ...("toolNames" in routing ? { toolNames: routing.toolNames, readOnly: routing.readOnly } : {}),
        }),
    );
    track("assistant_message_sent", ctx.userId, {
      portal: "manager",
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
      provider: result.provider,
      route: result.route,
      fallback: Boolean(result.fallbackReason),
      latencyMs: result.latencyMs,
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

    const archiveSaved = await appendAgentMessages(ctx, "manager", sessionId, [
      { role: "user", content: lastUserText(messages) },
      {
        role: "assistant",
        content: reply,
        toolTrace: {
          tools: result.toolTrace,
          model: result.model,
          tier: result.tier,
          provider: result.provider,
          route: result.route,
          fallback: Boolean(result.fallbackReason),
          latencyMs: result.latencyMs,
          ...(proposal ? { pendingAction: { toolName: proposal.toolName } } : {}),
        },
      },
    ], { kind: sessionKind });

    return assistantResponse(req, {
      reply,
      toolTrace: result.toolTrace,
      sessionId,
      ...(sessionKind === PORTAL_CHAT_SESSION_KIND ? { archiveSaved } : {}),
      ...(pendingAction ? { pendingAction } : {}),
    });
  } catch (e) {
    console.error("[agent/chat] turn failed:", e);
    const { message, httpStatus } = formatAgentChatUserError(e);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
