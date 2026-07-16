import { afterEach, describe, expect, it } from "vitest";
import {
  defaultResidentOnboardingSmsLinks,
  ensureSmsIncludesPortalLink,
  residentPortalPath,
  residentPortalUrl,
  residentSmsLinkOrigin,
  smsLinkKindForThreadTopic,
} from "@/lib/claw-resident-links";

const ORIGIN_KEYS = [
  "CLAW_MESSENGER_LINK_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

afterEach(() => {
  for (const key of ORIGIN_KEYS) delete process.env[key];
});

describe("claw-resident-links", () => {
  it("maps kinds to real resident portal paths", () => {
    expect(residentPortalPath("payments")).toBe("/resident/payments/pending");
    expect(residentPortalPath("lease")).toBe("/resident/lease");
    expect(residentPortalPath("move_in")).toBe("/resident/move-in");
    expect(residentPortalPath("inbox")).toBe("/resident/inbox/unopened");
    expect(residentPortalPath("services")).toBe("/resident/services/requests");
    expect(residentPortalPath("apply", { propertyId: "p1", bundleId: "b1" })).toBe(
      "/rent/apply?propertyId=p1&bundle=b1",
    );
  });

  it("prefers CLAW_MESSENGER_LINK_ORIGIN over localhost app url", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.CLAW_MESSENGER_LINK_ORIGIN = "https://www.axis-seattle-housing.com";
    expect(residentSmsLinkOrigin()).toBe("https://www.axis-seattle-housing.com");
    expect(residentPortalUrl("payments")).toBe(
      "https://www.axis-seattle-housing.com/resident/payments/pending",
    );
  });

  it("appends a labeled link only when body has no http(s) url", () => {
    const withLink = ensureSmsIncludesPortalLink("Rent is due.", "payments");
    expect(withLink).toContain("Pay / view charges:");
    expect(withLink).toContain("/resident/payments/pending");

    const already = ensureSmsIncludesPortalLink(
      "Open: https://example.com/pay",
      "payments",
    );
    expect(already).toBe("Open: https://example.com/pay");
  });

  it("maps thread topics to link kinds", () => {
    expect(smsLinkKindForThreadTopic("payment")).toBe("payments");
    expect(smsLinkKindForThreadTopic("lease")).toBe("lease");
    expect(smsLinkKindForThreadTopic("move_in")).toBe("move_in");
    expect(smsLinkKindForThreadTopic("general")).toBe("inbox");
  });

  it("onboarding footer includes sign-in, payments, and lease", () => {
    process.env.CLAW_MESSENGER_LINK_ORIGIN = "https://www.axis-seattle-housing.com";
    const lines = defaultResidentOnboardingSmsLinks();
    expect(lines.some((l) => l.includes("/auth/login"))).toBe(true);
    expect(lines.some((l) => l.includes("/resident/payments/pending"))).toBe(true);
    expect(lines.some((l) => l.includes("/resident/lease"))).toBe(true);
  });
});
