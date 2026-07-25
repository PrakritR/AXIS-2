import type Anthropic from "@anthropic-ai/sdk";
import { lastUserText } from "@/lib/agent/chat-handler";

/** Parse the modal / surface hint from `[Context: …]` on the last user turn. */
export function assistantContextHintFromMessages(messages: Anthropic.MessageParam[]): string {
  const text = lastUserText(messages);
  const match = text.match(/^\[Context:\s*([^\]]+)\]/);
  return match?.[1]?.trim() ?? "";
}

export function isPromotionAssistantContext(hint: string): boolean {
  const h = hint.toLowerCase();
  return h.includes("new promotion") || h.startsWith("promotion") || h.includes(" promotion (");
}

export function isListingDraftAssistantContext(hint: string): boolean {
  const h = hint.toLowerCase();
  return (
    h.includes("add listing") ||
    h.includes("create listing") ||
    h.includes("edit listing") ||
    h.includes("listing ·") ||
    h.includes("listing·")
  );
}

export function isLeaseAssistantContext(hint: string): boolean {
  const h = hint.toLowerCase();
  return h.startsWith("lease modal") || h.includes("edit lease ·") || h.includes("lease —");
}
