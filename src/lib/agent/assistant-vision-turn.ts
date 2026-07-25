import type Anthropic from "@anthropic-ai/sdk";
import { TIER_MODELS, type ModelTier } from "@/lib/agent/model";

/** True when the conversation includes image or PDF blocks the model must read. */
export function messagesNeedVisionModel(messages: Anthropic.MessageParam[]): boolean {
  for (const message of messages) {
    if (message.role !== "user" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === "image" || block.type === "document") return true;
    }
  }
  return false;
}

/** Vision requires Sonnet-or-better; pin standard tier for the whole turn. */
export function visionPinnedModel(): { model: string; tier: ModelTier } {
  return { model: TIER_MODELS.standard, tier: "standard" };
}
