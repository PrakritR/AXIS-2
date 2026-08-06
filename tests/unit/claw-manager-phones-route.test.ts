import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/webhooks/claw-messenger/manager-phones/route";

describe("retired Claw manager phone endpoint", () => {
  it("stays unavailable even when legacy environment values are present", async () => {
    const previousEnabled = process.env.CLAW_MESSENGER_ENABLED;
    const previousKey = process.env.CLAW_MESSENGER_API_KEY;
    process.env.CLAW_MESSENGER_ENABLED = "1";
    process.env.CLAW_MESSENGER_API_KEY = "legacy-key";
    try {
      const response = await GET(
        new Request("https://prop-lane.space/api/webhooks/claw-messenger/manager-phones", {
          headers: { Authorization: "Bearer legacy-key" },
        }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Claw Messenger is not configured." });
    } finally {
      if (previousEnabled) process.env.CLAW_MESSENGER_ENABLED = previousEnabled;
      else delete process.env.CLAW_MESSENGER_ENABLED;
      if (previousKey) process.env.CLAW_MESSENGER_API_KEY = previousKey;
      else delete process.env.CLAW_MESSENGER_API_KEY;
    }
  });
});
