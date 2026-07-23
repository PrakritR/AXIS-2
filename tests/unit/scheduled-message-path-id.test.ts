import { describe, expect, it } from "vitest";
import {
  decodeScheduledMessagePathId,
  encodeScheduledMessagePathId,
} from "@/lib/scheduled-message-path-id";

describe("scheduled-message-path-id", () => {
  const sampleId = "sched|charge-abc|pre_due|3|2026-07-06";

  it("round-trips pipe-delimited ids through base64url path segments", () => {
    const encoded = encodeScheduledMessagePathId(sampleId);
    expect(encoded).not.toContain("|");
    expect(decodeScheduledMessagePathId(encoded)).toBe(sampleId);
  });

  it("passes through legacy plain ids without pipes", () => {
    const plain = "sched_inbox_123";
    expect(encodeScheduledMessagePathId(plain)).toBe(encodeURIComponent(plain));
    expect(decodeScheduledMessagePathId(plain)).toBe(plain);
  });

  it("never relies on the 'base64url' encoding token (browser Buffer polyfill throws on it)", () => {
    // Next's browser Buffer polyfill throws "Unknown encoding: base64url"; the
    // encoder ran client-side to build the scheduled-message action URL, so a
    // Buffer.from(x, 'base64url') path crashed Send now / Cancel / Edit on
    // automation messages. Simulate that polyfill and prove encode/decode work.
    const realBuffer = globalThis.Buffer;
    const throwing = {
      from(input: string, enc?: string) {
        if (enc === "base64url") throw new Error("Unknown encoding: base64url");
        return realBuffer.from(input, enc as BufferEncoding);
      },
    };
    (globalThis as unknown as { Buffer: unknown }).Buffer = throwing;
    try {
      const encoded = encodeScheduledMessagePathId(sampleId);
      expect(encoded).not.toContain("|");
      expect(decodeScheduledMessagePathId(encoded)).toBe(sampleId);
    } finally {
      globalThis.Buffer = realBuffer;
    }
  });
});
