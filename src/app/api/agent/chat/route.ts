import { NextResponse } from "next/server";
import { resolveAgentContext } from "@/lib/tools/context";
import { agentRegistry } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { sanitizeChatMessages, lastUserText } from "@/lib/agent/chat-handler";
import { parseChatImages, buildImageUserMessage } from "@/lib/agent/images";
import { persistPendingAction } from "@/lib/tools/pending-actions";
import { ensureAgentSession, appendAgentMessages } from "@/lib/agent/sessions";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

/**
 * Manager-portal assistant turn. Write tools are exposed to the model but a
 * proposal never executes here: the loop halts, the proposal is persisted, and
 * only the gated /api/agent/action endpoint can execute it after the user
 * confirms.
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

  const messages = sanitizeChatMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  // Optional image attachments apply to the LAST user message only; history
  // stays text-only so tool_use/image blocks never cross a turn boundary.
  const images = parseChatImages(body.images);
  if (!images.ok) return NextResponse.json({ error: images.error }, { status: 400 });
  if (images.blocks.length > 0) {
    messages[messages.length - 1] = buildImageUserMessage(
      String(messages[messages.length - 1]!.content ?? ""),
      images.blocks,
    );
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
        runAgentTurn({ ctx, registry: agentRegistry, system: SYSTEM_PROMPT, messages, observer }),
    );
    track("assistant_message_sent", ctx.userId, {
      portal: "manager",
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
      images: images.blocks.length,
    });

    let pendingAction = null;
    if (result.proposedAction) {
      pendingAction = await persistPendingAction(ctx, {
        portal: "manager",
        sessionId,
        toolName: result.proposedAction.toolName,
        input: result.proposedAction.input,
        preview: result.proposedAction.preview,
        destructive: result.proposedAction.destructive,
      });
      if (pendingAction) {
        track("assistant_action_proposed", ctx.userId, {
          portal: "manager",
          tool: pendingAction.toolName,
          batch: pendingAction.preview.batchCount ?? 1,
        });
      }
    }

    appendAgentMessages(ctx, "manager", sessionId, [
      { role: "user", content: lastUserText(messages) },
      {
        role: "assistant",
        content: result.reply,
        toolTrace: {
          tools: result.toolTrace,
          model: result.model,
          tier: result.tier,
          ...(pendingAction ? { pendingAction: { toolName: pendingAction.toolName } } : {}),
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
    console.error("[agent/chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
