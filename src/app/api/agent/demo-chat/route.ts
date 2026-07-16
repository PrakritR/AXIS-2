import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import { sanitizeChatMessages } from "@/lib/agent/chat-handler";
import { buildDemoAgentContext } from "@/lib/demo/demo-agent-context";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * PUBLIC, UNAUTHENTICATED demo chatbot for the marketing `/demo` page.
 *
 * It runs the SAME agent loop as `/api/agent/chat`, but against a fixed,
 * sandboxed context backed by fictional in-memory data — never a real account
 * or database (`buildDemoAgentContext`). This is safe by construction:
 *
 *  - A write-tool proposal halts the loop with a preview, exactly like the
 *    real assistant — but this route NEVER persists it. It returns a
 *    `simulated` pending action; confirming from the demo UI posts back here
 *    and receives a canned "nothing was actually sent" reply. Nothing can
 *    execute because /api/agent/action requires an authenticated actor and a
 *    real persisted row.
 *  - The stub DB has no real rows, so a prompt-injection attempt in the (fake)
 *    tenant text can neither read real data nor trigger an action. The system
 *    prompt additionally treats tool-result text as untrusted data.
 *  - Being public and token-costing, it is IP rate-limited.
 */
export async function POST(req: Request) {
  const ip = clientIpFrom(req);
  if (!rateLimit(`demo-chat:${ip}`, 12, 60_000).ok) {
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

  // Demo confirm path: the card was shown, but nothing is ever executed.
  if (body.actionId || body.confirmAction) {
    return NextResponse.json({
      status: "executed",
      reply:
        "In this live demo, actions are previewed but not actually performed — sign up to enable real actions.",
      toolTrace: [],
    });
  }

  const messages = sanitizeChatMessages(body.messages, { maxMessages: 16, maxChars: 4000 });
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The demo assistant isn't configured in this environment." },
      { status: 503 },
    );
  }

  try {
    const ctx = buildDemoAgentContext();
    const result = await runAgentTurn({ ctx, registry: agentRegistry, messages });
    if (result.proposedAction) {
      return NextResponse.json({
        reply: result.reply,
        toolTrace: result.toolTrace,
        pendingAction: {
          id: "demo",
          toolName: result.proposedAction.toolName,
          destructive: result.proposedAction.destructive,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          preview: result.proposedAction.preview,
          simulated: true,
        },
      });
    }
    return NextResponse.json({ reply: result.reply, toolTrace: result.toolTrace });
  } catch (e) {
    console.error("[agent/demo-chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
