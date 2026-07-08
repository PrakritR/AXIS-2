import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { agentRegistry } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import { buildDemoAgentContext } from "@/lib/demo/demo-agent-context";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { traceAgentTurn } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * PUBLIC, UNAUTHENTICATED demo chatbot for the marketing `/demo` page.
 *
 * It runs the SAME read-only agent loop as `/api/agent/chat`, but against a
 * fixed, sandboxed context backed by fictional in-memory data — never a real
 * account or database (`buildDemoAgentContext`). This is safe by construction:
 *
 *  - The agent loop only ever exposes READ tools; write tools are never callable
 *    by the model, and this route deliberately omits the gated `confirmAction`
 *    write path entirely — so nothing can be sent, charged, or persisted.
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

  // The write/confirm path is intentionally unsupported in the demo.
  if (body.confirmAction) {
    return NextResponse.json({
      reply:
        "In this live demo, actions like sending a rent reminder are shown but not actually sent — sign up to enable real actions.",
      toolTrace: [],
    });
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
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

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
    const result = await traceAgentTurn(ctx, messages as ChatMessage[], (observer) =>
      runAgentTurn({ ctx, registry: agentRegistry, messages, observer }),
    );
    return NextResponse.json({ reply: result.reply, toolTrace: result.toolTrace });
  } catch (e) {
    console.error("[agent/demo-chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
