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
});
