import { describe, expect, it } from "vitest";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";

describe("managerOauthFinishPath", () => {
  it("builds finish route with encoded session id", () => {
    expect(managerOauthFinishPath("axis_intent_abc")).toBe(
      "/auth/manager-oauth-finish?session_id=axis_intent_abc",
    );
    expect(managerOauthFinishPath("cs_test_123")).toBe("/auth/manager-oauth-finish?session_id=cs_test_123");
  });
});
