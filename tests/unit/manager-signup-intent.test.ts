import { describe, expect, it } from "vitest";
import { AXIS_INTENT_PREFIX, isAxisIntentSessionId, newAxisIntentSessionId } from "@/lib/manager-signup-intent";

describe("manager-signup-intent", () => {
  it("creates axis intent session ids", () => {
    const id = newAxisIntentSessionId();
    expect(id.startsWith(AXIS_INTENT_PREFIX)).toBe(true);
    expect(isAxisIntentSessionId(id)).toBe(true);
    expect(isAxisIntentSessionId("cs_test_123")).toBe(false);
  });
});
