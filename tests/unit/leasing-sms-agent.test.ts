import { describe, expect, it } from "vitest";
import { LEASING_SMS_SYSTEM_PROMPT } from "@/lib/agent/leasing-sms-system-prompt";
import { leasingSmsAgentRegistry } from "@/lib/tools";
import { LEASING_ESCALATE_TOOL_NAME } from "@/lib/tools/domains/leasing-sms";

describe("leasing SMS agent registry", () => {
  it("exposes only listing + escalate tools", () => {
    expect([...leasingSmsAgentRegistry.keys()].sort()).toEqual(
      [
        "build_prospect_links",
        "escalate_to_manager",
        "get_listing_details",
        "list_live_listings",
      ].sort(),
    );
  });

  it("marks escalate as the only write tool", () => {
    const writes = [...leasingSmsAgentRegistry.values()].filter((t) => t.kind === "write");
    expect(writes.map((t) => t.name)).toEqual([LEASING_ESCALATE_TOOL_NAME]);
  });

  it("system prompt requires tool-grounded facts and SMS style", () => {
    expect(LEASING_SMS_SYSTEM_PROMPT).toMatch(/ONLY from tool results/i);
    expect(LEASING_SMS_SYSTEM_PROMPT).toMatch(/SMS-short/i);
    expect(LEASING_SMS_SYSTEM_PROMPT).toMatch(/untrusted input/i);
  });
});
