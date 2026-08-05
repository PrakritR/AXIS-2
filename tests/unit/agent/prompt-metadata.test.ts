import { describe, expect, it } from "vitest";
import { hashSystemPrompt, resolvePromptMeta, resolveReleaseSha } from "@/lib/agent/prompt-metadata";

describe("prompt-metadata", () => {
  it("hashes the exact system string stably", () => {
    expect(hashSystemPrompt("hello")).toBe(hashSystemPrompt("hello"));
    expect(hashSystemPrompt("hello")).not.toBe(hashSystemPrompt("hello "));
    expect(hashSystemPrompt("hello")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves prompt id, hash, and release together", () => {
    const prev = process.env.AXIS_RELEASE_SHA;
    process.env.AXIS_RELEASE_SHA = "abcdef0123456789";
    try {
      const meta = resolvePromptMeta("manager-assistant", "SYS");
      expect(meta.promptId).toBe("manager-assistant");
      expect(meta.promptHash).toBe(hashSystemPrompt("SYS"));
      expect(meta.release).toBe("abcdef0123456789");
      expect(resolveReleaseSha()).toBe("abcdef0123456789");
    } finally {
      if (prev === undefined) delete process.env.AXIS_RELEASE_SHA;
      else process.env.AXIS_RELEASE_SHA = prev;
    }
  });
});
