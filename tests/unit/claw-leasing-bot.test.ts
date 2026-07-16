import { describe, expect, it } from "vitest";
import {
  buildSmsDeepLink,
  classifyLeasingIntent,
  extractBundleIdHint,
  extractPropertyIdHint,
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

  it("detects listing CTA bodies so manager phones still get the leasing bot", async () => {
    const { looksLikeProspectLeasingCta } = await import("@/lib/claw-leasing-links");
    expect(
      looksLikeProspectLeasingCta(
        'Hi — I\'d like to apply for the bundle "Two or more rooms" (propertyId=mgr-1, bundleId=bun-2).',
      ),
    ).toBe(true);
    expect(looksLikeProspectLeasingCta("Hi — I have a question (propertyId=mgr-1).")).toBe(true);
    expect(looksLikeProspectLeasingCta("Sure, Saturday at 2 works for them")).toBe(false);
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

  it("builds sms deep links without propertyId= in the draft body", () => {
    const href = buildSmsDeepLink({
      intent: "tour",
      propertyId: "mgr-1",
      propertyLabel: "4709B 8th Ave NE",
    });
    expect(href.startsWith("sms:")).toBe(true);
    const decoded = decodeURIComponent(href.split("body=")[1] ?? "");
    expect(decoded).toBe("Hi — I'd like to schedule a tour for 4709B 8th Ave NE.");

    const apply = buildSmsDeepLink({
      intent: "apply",
      propertyId: "mgr-test-alder",
      propertyLabel: "Alder Row — 3 rooms",
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
    });
    expect(decodeURIComponent(bundle.split("body=")[1] ?? "")).toBe(
      'Hi — I\'d like to apply for the bundle "Two or more rooms" at Alder Row — 3 rooms.',
    );
  });

  it("apply reply includes application link; tour reply asks intake questions", () => {
    const apply = replyForIntent({
      intent: "apply",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(apply).toContain("/rent/apply");
    expect(apply).toContain("propertyId=mgr-test-magnolia");

    const tour = replyForIntent({
      intent: "tour",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(tour.toLowerCase()).toContain("full name");
    expect(tour.toLowerCase()).toContain("date/time");
    expect(tour).not.toContain("/rent/tours-contact");
  });

  it("bundle reply includes apply link with bundle query; question does not open web form", () => {
    const bundle = replyForIntent({
      intent: "bundle",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
      bundleId: "bun-2",
    });
    expect(bundle).toContain("/rent/apply");
    expect(bundle).toContain("bundle=bun-2");
    expect(bundle).not.toContain("/rent/tours-contact");

    const question = replyForIntent({
      intent: "question",
      origin: "https://www.axis-seattle-housing.com",
      propertyId: "mgr-test-magnolia",
      propertyLabel: "Magnolia House",
    });
    expect(question.toLowerCase()).toMatch(/imessage|sms/);
    expect(question).not.toContain("/rent/tours-contact");
  });
});
