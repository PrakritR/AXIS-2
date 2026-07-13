import { describe, expect, it } from "vitest";
import {
  DEFAULT_VENDOR_DISPATCH_SETTINGS,
  normalizeVendorDispatchSettings,
} from "@/lib/vendor-dispatch-settings";

describe("normalizeVendorDispatchSettings", () => {
  it("defaults to a fully dark feature", () => {
    expect(normalizeVendorDispatchSettings(null)).toEqual(DEFAULT_VENDOR_DISPATCH_SETTINGS);
    expect(normalizeVendorDispatchSettings({})).toEqual(DEFAULT_VENDOR_DISPATCH_SETTINGS);
    expect(normalizeVendorDispatchSettings("junk")).toEqual(DEFAULT_VENDOR_DISPATCH_SETTINGS);
    expect(DEFAULT_VENDOR_DISPATCH_SETTINGS.mode).toBe("off");
    expect(DEFAULT_VENDOR_DISPATCH_SETTINGS.agentMessagingEnabled).toBe(false);
  });

  it("accepts only known modes", () => {
    expect(normalizeVendorDispatchSettings({ mode: "approve" }).mode).toBe("approve");
    expect(normalizeVendorDispatchSettings({ mode: "auto" }).mode).toBe("auto");
    expect(normalizeVendorDispatchSettings({ mode: "yolo" }).mode).toBe("off");
  });

  it("clamps the spend cap to a positive integer or null", () => {
    expect(normalizeVendorDispatchSettings({ spendCapCents: 25000 }).spendCapCents).toBe(25000);
    expect(normalizeVendorDispatchSettings({ spendCapCents: 100.7 }).spendCapCents).toBe(101);
    expect(normalizeVendorDispatchSettings({ spendCapCents: 0 }).spendCapCents).toBeNull();
    expect(normalizeVendorDispatchSettings({ spendCapCents: -5 }).spendCapCents).toBeNull();
    expect(normalizeVendorDispatchSettings({ spendCapCents: "abc" }).spendCapCents).toBeNull();
  });

  it("keeps list filters null when absent and trims entries when present", () => {
    const s = normalizeVendorDispatchSettings({
      approvedVendorIds: [" v1 ", "", "v2"],
      categories: ["plumbing"],
    });
    expect(s.approvedVendorIds).toEqual(["v1", "v2"]);
    expect(s.categories).toEqual(["plumbing"]);
    const empty = normalizeVendorDispatchSettings({ approvedVendorIds: "nope" });
    expect(empty.approvedVendorIds).toBeNull();
  });

  it("preserves an explicitly empty approved list (auto approves nobody)", () => {
    expect(normalizeVendorDispatchSettings({ approvedVendorIds: [] }).approvedVendorIds).toEqual([]);
  });

  it("normalizes notify prefs with push defaulting on and sms off", () => {
    expect(normalizeVendorDispatchSettings({}).notify).toEqual({ push: true, sms: false });
    expect(normalizeVendorDispatchSettings({ notify: { push: false, sms: true } }).notify).toEqual({
      push: false,
      sms: true,
    });
  });

  it("round-trips a normalized value", () => {
    const s = normalizeVendorDispatchSettings({
      mode: "auto",
      agentMessagingEnabled: true,
      spendCapCents: 50000,
      approvedVendorIds: ["v1"],
      categories: ["hvac"],
      notify: { push: true, sms: true },
    });
    expect(normalizeVendorDispatchSettings(s)).toEqual(s);
  });
});
