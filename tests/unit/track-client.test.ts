import { describe, expect, it, vi, afterEach } from "vitest";

// Mock the posthog-js singleton so the helper has a capture() to forward to.
// vi.mock is hoisted, so build the spy via vi.hoisted to keep it in scope.
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture } }));

import { track } from "@/lib/analytics/track-client";

describe("track-client", () => {
  // Reset after each test so a per-test mockImplementation (e.g. the throwing
  // one below) never leaks into file teardown, which vitest surfaces as an error.
  afterEach(() => capture.mockReset());

  it("forwards event name and properties to posthog.capture", () => {
    track("charge_created", { kind: "rent", amount: 1200 });
    expect(capture).toHaveBeenCalledWith("charge_created", { kind: "rent", amount: 1200 });
  });

  it("works with no properties", () => {
    track("assistant_opened");
    expect(capture).toHaveBeenCalledWith("assistant_opened", undefined);
  });

  it("never throws when posthog.capture blows up (analytics must not break the UI)", () => {
    capture.mockImplementation(() => {
      throw new Error("posthog not loaded");
    });
    let threw = false;
    try {
      track("feedback_submitted", { role: "manager" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
