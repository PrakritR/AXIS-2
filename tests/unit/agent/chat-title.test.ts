import { describe, expect, it } from "vitest";

import {
  agentChatThreadTitleFromPrompts,
  normalizeGeneratedAgentChatThreadTitle,
  readGeneratedAgentChatThreadTitle,
  storeGeneratedAgentChatThreadTitle,
} from "@/lib/agent/chat-title";

describe("agent chat titles", () => {
  it("uses the first useful prompt after a vague greeting", () => {
    expect(agentChatThreadTitleFromPrompts(["Hi", "Show overdue rent for this month"])).toBe(
      "Show overdue rent for this month",
    );
  });

  it("accepts only compact model titles and keeps their storage marker private", () => {
    expect(normalizeGeneratedAgentChatThreadTitle('Title: "Overdue Rent Summary"')).toBe("Overdue Rent Summary");
    expect(normalizeGeneratedAgentChatThreadTitle("Overdue Rent Summary For August")).toBeNull();
    expect(readGeneratedAgentChatThreadTitle(storeGeneratedAgentChatThreadTitle("Overdue Rent Summary"))).toBe(
      "Overdue Rent Summary",
    );
  });
});
