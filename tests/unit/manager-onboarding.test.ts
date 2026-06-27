import { describe, expect, it } from "vitest";
import {
  isAxisPendingSessionId,
  isManagerOnboardingComplete,
  newAxisPendingSessionId,
} from "@/lib/auth/manager-onboarding";

describe("manager onboarding", () => {
  it("detects pending session ids", () => {
    const id = newAxisPendingSessionId();
    expect(isAxisPendingSessionId(id)).toBe(true);
    expect(isAxisPendingSessionId("axis_intent_abc")).toBe(false);
  });

  it("treats pending purchases as incomplete onboarding", () => {
    expect(
      isManagerOnboardingComplete({
        id: "1",
        email: "a@example.com",
        manager_id: "AXIS-1",
        tier: null,
        billing: null,
        stripe_checkout_session_id: newAxisPendingSessionId(),
        user_id: "user-1",
      }),
    ).toBe(false);
  });

  it("treats free tier purchases as complete", () => {
    expect(
      isManagerOnboardingComplete({
        id: "1",
        email: "a@example.com",
        manager_id: "AXIS-1",
        tier: "free",
        billing: "monthly",
        stripe_checkout_session_id: "axis_intent_abc",
        user_id: "user-1",
      }),
    ).toBe(true);
  });
});
