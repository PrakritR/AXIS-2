/**
 * Shared helpers for the portal chat routes (manager / resident / vendor /
 * demo). Each route keeps its own context resolution, registry, and gating —
 * only the genuinely common message plumbing lives here.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Sanitize client-supplied conversation history: user/assistant string
 * messages only, bounded count and per-message size. History is text-only by
 * design — tool_use blocks never cross a turn boundary, which is what makes
 * halting on a write proposal safe.
 */
export function sanitizeChatMessages(
  raw: unknown,
  opts: { maxMessages?: number; maxChars?: number } = {},
): Anthropic.MessageParam[] {
  const maxMessages = opts.maxMessages ?? 20;
  const maxChars = opts.maxChars ?? 8000;
  const rawMessages = Array.isArray(raw) ? (raw as ChatMessage[]) : [];
  return rawMessages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-maxMessages)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

/** The last user message's text, for trace inputs and persistence. */
export function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}
