import type Anthropic from "@anthropic-ai/sdk";
import type { ModelTier } from "@/lib/agent/model";

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

/**
 * Vision + tools need a vision-capable model. Never inherit `AXIS_AGENT_MODEL`
 * when it pins Haiku for cost — that combination fails attachment turns.
 */
export function visionPinnedModel(): { model: string; tier: ModelTier } {
  const model =
    process.env.AXIS_AGENT_MODEL_VISION?.trim() ||
    process.env.AXIS_AGENT_MODEL_STANDARD?.trim() ||
    "claude-sonnet-4-6";
  return { model, tier: "standard" };
}
