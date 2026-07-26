import { describe, expect, it } from "vitest";
import {
  assistantContextHintFromMessages,
  isListingDraftAssistantContext,
  isPromotionAssistantContext,
} from "@/lib/agent/assistant-turn-context";

describe("assistant turn context hints", () => {
  it("parses the Context prefix from the last user message", () => {
    const hint = assistantContextHintFromMessages([
      {
        role: "user",
        content: "[Context: New promotion (flyer) · propertyId=p1]\n\nMatch this flyer",
      },
    ]);
    expect(hint).toContain("New promotion");
    expect(hint).toContain("propertyId=p1");
  });

  it("reads text blocks from multipart user content", () => {
    const hint = assistantContextHintFromMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "[Context: Add listing · Photos]\n\nHere are photos" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc" } },
        ],
      },
    ]);
    expect(isListingDraftAssistantContext(hint)).toBe(true);
  });

  it("classifies promotion vs listing draft surfaces", () => {
    expect(isPromotionAssistantContext("New promotion (flyer) · propertyId=mgr-1")).toBe(true);
    expect(isPromotionAssistantContext("Payment reminders modal")).toBe(false);
    expect(isListingDraftAssistantContext("Add listing · Photos")).toBe(true);
    expect(isListingDraftAssistantContext("New promotion (flyer)")).toBe(false);
  });
});
