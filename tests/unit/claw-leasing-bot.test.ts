import { describe, expect, it } from "vitest";
import {
  buildSmsDeepLink,
  classifyLeasingIntent,
  extractBundleIdHint,
  extractPropertyIdHint,
  isClawMessagingPubliclyEnabled,
  isLegacyClawSharedSmsNumber,
  managerContactSmsPhoneForPublicCta,
} from "@/lib/claw-leasing-links";
import { replyForIntent } from "@/lib/claw-leasing-bot.server";

describe("claw leasing intent", () => {
  it("classifies tour / apply / lease / help", () => {
    expect(classifyLeasingIntent("I'd like a tour this week")).toBe("tour");
    expect(classifyLeasingIntent("Can I apply for the room?")).toBe("apply");
    expect(classifyLeasingIntent("Ready to sign the lease")).toBe("lease");
    expect(classifyLeasingIntent("help")).toBe("help");
    expect(classifyLeasingIntent("Hi")).toBe("greeting");
  });

  it("classifies Text-to-tour / Text-to-apply CTA bodies (even when they start with Hi)", () => {
    expect(
      classifyLeasingIntent(
        "Hi — I'd like to apply for Magnolia House — 5 rooms (propertyId=mgr-test-magnolia).",
      ),
    ).toBe("apply");
    expect(
      classifyLeasingIntent(
        "Hi — I'd like to schedule a tour for Magnolia House (propertyId=mgr-test-magnolia).",
      ),
    ).toBe("tour");
  });

  it("classifies bundle and question CTA bodies", () => {
    expect(
      classifyLeasingIntent(
        'Hi — I\'d like to apply for the bundle "Two or more rooms" (propertyId=mgr-1, bundleId=bun-2).',
      ),
    ).toBe("bundle");
    expect(
      classifyLeasingIntent(
        "Hi — I have a question about Magnolia House (propertyId=mgr-1).",
      ),
    ).toBe("question");
  });

  it("detects listing CTA bodies and freeform tour/apply so they skip the resident hub", async () => {
    const { looksLikeProspectLeasingCta } = await import("@/lib/claw-leasing-links");
    expect(
      looksLikeProspectLeasingCta(
        'Hi — I\'d like to apply for the bundle "Two or more rooms" (propertyId=mgr-1, bundleId=bun-2).',
      ),
    ).toBe(true);
    expect(looksLikeProspectLeasingCta("Hi — I have a question (propertyId=mgr-1).")).toBe(true);
    expect(looksLikeProspectLeasingCta("Hey I want a tour of the house can you help me")).toBe(true);
    expect(looksLikeProspectLeasingCta("Can I apply for The Pioneer?")).toBe(true);
    expect(looksLikeProspectLeasingCta("Sure, Saturday at 2 works for them")).toBe(false);
  });

  it("classifies freeform tour requests", () => {
    expect(classifyLeasingIntent("Hey I want a tour of the house can you help me")).toBe("tour");
    expect(classifyLeasingIntent("Hi — I'd like to schedule a tour for The Pioneer.")).toBe("tour");
  });

  it("extracts propertyId and bundleId hints from sms bodies", () => {
    expect(extractPropertyIdHint("tour propertyId=mgr-house-1")).toBe("mgr-house-1");
    expect(extractPropertyIdHint("listing # abcdef123456")).toBe("abcdef123456");
    expect(extractPropertyIdHint("https://www.axis-seattle-housing.com/rent/listings/mgr-test-alder")).toBe(
      "mgr-test-alder",
    );
    expect(extractBundleIdHint("apply (propertyId=mgr-1, bundleId=bun-abc)")).toBe("bun-abc");
    expect(
      extractBundleIdHint("https://www.axis-seattle-housing.com/rent/listings/mgr-1?bundle=bun-2"),
    ).toBe("bun-2");
  });

  it("does not enable public CTAs for Claw/555 when the Claw bridge is off", () => {
    const prev = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    expect(isLegacyClawSharedSmsNumber("+12053690702")).toBe(true);
    expect(managerContactSmsPhoneForPublicCta("+12053690702")).toBeNull();
    expect(isClawMessagingPubliclyEnabled("+12053690702")).toBe(false);
    expect(managerContactSmsPhoneForPublicCta("+12065550199")).toBeNull();
    expect(isClawMessagingPubliclyEnabled("+12065550199")).toBe(false);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = prev;
  });

  it("allows the shared Claw line for CTAs while the bridge is on", () => {
    const prev = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "1";
    expect(managerContactSmsPhoneForPublicCta("+12053690702")).toBe("+12053690702");
    expect(isClawMessagingPubliclyEnabled("+12053690702")).toBe(true);
    expect(
      buildSmsDeepLink({ intent: "tour", propertyLabel: "Test", toPhone: "+12053690702" }).startsWith(
        "sms:+12053690702",
      ),
    ).toBe(true);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = prev;
  });

  it("returns # when no manager work number is provided", () => {
    const prev = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    expect(buildSmsDeepLink({ intent: "tour", propertyLabel: "Test" })).toBe("#");
    expect(
      buildSmsDeepLink({ intent: "tour", propertyLabel: "Test", toPhone: "+12053690702" }),
    ).toBe("#");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
    else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = prev;
  });

  it("builds sms deep links to the manager work number when provided", () => {
    const href = buildSmsDeepLink({
      intent: "tour",
      propertyId: "mgr-1",
      propertyLabel: "4709B 8th Ave NE",
      toPhone: "+14258909021",
    });
    expect(href.startsWith("sms:+14258909021")).toBe(true);
    const decoded = decodeURIComponent(href.split("body=")[1] ?? "");
    expect(decoded).toBe("Hi — I'd like to schedule a tour for 4709B 8th Ave NE.");
  });

  it("builds sms deep links without propertyId= in the draft body", () => {
    const href = buildSmsDeepLink({
      intent: "tour",
      propertyId: "mgr-1",
      propertyLabel: "4709B 8th Ave NE",
      toPhone: "+14258909021",
    });
    expect(href.startsWith("sms:")).toBe(true);
    const decoded = decodeURIComponent(href.split("body=")[1] ?? "");
    expect(decoded).toBe("Hi — I'd like to schedule a tour for 4709B 8th Ave NE.");

    const apply = buildSmsDeepLink({
      intent: "apply",
      propertyId: "mgr-test-alder",
      propertyLabel: "Alder Row — 3 rooms",
      toPhone: "+14258909021",
    });
    expect(decodeURIComponent(apply.split("body=")[1] ?? "")).toBe(
      "Hi — I'd like to apply for Alder Row — 3 rooms.",
    );

    const bundle = buildSmsDeepLink({
      intent: "bundle",
      propertyId: "mgr-1",
      propertyLabel: "Alder Row — 3 rooms",
      bundleId: "bun-2",
      bundleLabel: "Two or more rooms",
      toPhone: "+14258909021",
    });
    expect(decodeURIComponent(bundle.split("body=")[1] ?? "")).toBe(
      'Hi — I\'d like to apply for the bundle "Two or more rooms" at Alder Row — 3 rooms.',
    );
  });

  it("apply reply includes application link; tour reply includes booking link + intake", () => {
    const apply = replyForIntent({
      intent: "apply",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(apply).toContain("/rent/apply");
    expect(apply).toContain("propertyId=mgr-test-magnolia");
    expect(apply).toContain("/rent/tours-contact");

    const tour = replyForIntent({
      intent: "tour",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(tour.toLowerCase()).toContain("name");
    expect(tour.toLowerCase()).toContain("times");
    expect(tour).toContain("/rent/tours-contact?propertyId=mgr-test-magnolia");
    expect(tour).not.toMatch(/leasing assistant/i);
    expect(tour).not.toMatch(/^1\)/m);
    expect(tour).not.toContain("/resident/payments");
  });

  it("bundle reply includes apply + tour links; question includes tour and apply links", () => {
    const bundle = replyForIntent({
      intent: "bundle",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
      bundleId: "bun-2",
    });
    expect(bundle).toContain("/rent/apply");
    expect(bundle).toContain("bundle=bun-2");
    expect(bundle).toContain("/rent/tours-contact");

    const question = replyForIntent({
      intent: "question",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(question.toLowerCase()).toMatch(/reply here|got your note/);
    expect(question).toContain("/rent/tours-contact");
    expect(question).toContain("/rent/apply");
    expect(question).not.toMatch(/forwarded to the property manager/i);
    expect(question).not.toContain("/resident/payments");
  });
});
