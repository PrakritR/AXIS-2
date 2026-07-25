import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  GENERIC_ASSISTANT_ERROR_DEAD_END,
  userFacingAssistantError,
} from "@/lib/agent/assistant-turn-error";
import { messagesNeedVisionModel } from "@/lib/agent/assistant-vision-turn";

describe("userFacingAssistantError", () => {
  it("never returns the banned generic dead-end string", () => {
    const cases: unknown[] = [
      new Error("boom"),
      new Anthropic.APIError(500, undefined, "server error", undefined),
      new Anthropic.APIError(429, undefined, "rate limited", undefined),
      new Anthropic.APIError(400, undefined, "prompt is too long: tokens", undefined),
    ];
    for (const err of cases) {
      expect(userFacingAssistantError(err).message).not.toBe(GENERIC_ASSISTANT_ERROR_DEAD_END);
      expect(userFacingAssistantError(err).message.length).toBeGreaterThan(20);
    }
  });

  it("maps rate limits to 429", () => {
    const err = new Anthropic.APIError(429, undefined, "rate limited", undefined);
    expect(userFacingAssistantError(err).httpStatus).toBe(429);
  });
});

describe("messagesNeedVisionModel", () => {
  it("detects image blocks on the user turn", () => {
    expect(
      messagesNeedVisionModel([
        {
          role: "user",
          content: [
            { type: "text", text: "hi" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "x" } },
          ],
        },
      ]),
    ).toBe(true);
  });
});
