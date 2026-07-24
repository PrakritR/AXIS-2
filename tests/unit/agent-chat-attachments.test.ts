import { describe, expect, it } from "vitest";

import { applyChatAttachments } from "@/lib/agent/chat-handler";
import { parseChatDocuments, parseChatImages } from "@/lib/agent/images";

describe("parseChatDocuments", () => {
  it("accepts a valid PDF payload", () => {
    const result = parseChatDocuments([
      { mediaType: "application/pdf", dataBase64: "YWJj", fileName: "lease.pdf" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]?.type).toBe("document");
    }
  });

  it("rejects unsupported document types", () => {
    const result = parseChatDocuments([{ mediaType: "text/plain", dataBase64: "YWJj" }]);
    expect(result.ok).toBe(false);
  });
});

describe("applyChatAttachments", () => {
  it("merges images and PDFs onto the last user message", () => {
    const messages = applyChatAttachments(
      [{ role: "user", content: "Review this lease" }],
      {
        images: [{ mediaType: "image/png", dataBase64: "aGVsbG8=" }],
        documents: [{ mediaType: "application/pdf", dataBase64: "YWJj" }],
      },
    );
    expect(messages.ok).toBe(true);
    if (messages.ok) {
      expect(messages.imageCount).toBe(1);
      expect(messages.documentCount).toBe(1);
      expect(Array.isArray(messages.messages.at(-1)?.content)).toBe(true);
    }
  });
});

describe("parseChatImages", () => {
  it("still accepts image payloads", () => {
    const result = parseChatImages([{ mediaType: "image/jpeg", dataBase64: "YWJj" }]);
    expect(result.ok).toBe(true);
  });
});
