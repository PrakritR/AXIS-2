/**
 * Public "Text to tour" / "Text to apply" CTA routing.
 *
 * Production sends prospects to the property's OWN manager's verified phone
 * (interim measure while the Twilio A2P campaign is in carrier review);
 * localhost / preview / test keep using the shared Claw Messenger leasing line
 * so the leasing-agent flow stays exercisable. See
 * `src/lib/listing-cta-phone.server.ts` and `docs/agents/sms-system.md`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSmsDeepLink, isClawMessagingPubliclyEnabled } from "@/lib/claw-leasing-links";
import { withListingContactSmsPhone } from "@/lib/listing-contact-sms";
import {
  listingCtaSendsToManagerOwnPhone,
  resolveListingCtaSmsPhone,
} from "@/lib/listing-cta-phone.server";
import type { MockProperty } from "@/data/types";

const CLAW_LINE = "+12053690702";

/** Two managers in one fleet, each with their own verified cell. */
const ALICE = {
  phone: "+14258909021",
  phone_verified_at: "2026-01-04T00:00:00.000Z",
  sms_from_number: CLAW_LINE,
};
const BOB = {
  phone: "(206) 471-0000", // stored unformatted; normalized to +12064710000
  phone_verified_at: "2026-02-11T00:00:00.000Z",
  sms_from_number: CLAW_LINE,
};

let priorVercelEnv: string | undefined;
let priorNodeEnv: string | undefined;
let priorClawFlag: string | undefined;

function setRuntime(vercelEnv: string) {
  process.env.VERCEL_ENV = vercelEnv;
}

beforeEach(() => {
  priorVercelEnv = process.env.VERCEL_ENV;
  priorNodeEnv = process.env.NODE_ENV;
  priorClawFlag = process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
  // Claw is the primary transport in every environment; only CTA targeting splits.
  process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = "1";
});

afterEach(() => {
  if (priorVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = priorVercelEnv;
  if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorNodeEnv;
  if (priorClawFlag === undefined) delete process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED;
  else process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED = priorClawFlag;
});

describe("listing CTA phone — environment split", () => {
  it("routes production CTAs to each property's OWN manager", () => {
    setRuntime("production");
    expect(listingCtaSendsToManagerOwnPhone()).toBe(true);
    expect(resolveListingCtaSmsPhone(ALICE)).toBe("+14258909021");
    expect(resolveListingCtaSmsPhone(BOB)).toBe("+12064710000");
    // A multi-manager fleet must never collapse onto one number.
    expect(resolveListingCtaSmsPhone(ALICE)).not.toBe(resolveListingCtaSmsPhone(BOB));
  });

  it("keeps localhost, preview and test on the Claw leasing line", () => {
    for (const env of ["development", "preview"]) {
      setRuntime(env);
      expect(listingCtaSendsToManagerOwnPhone(), env).toBe(false);
      // Every manager — and an unresolvable one — reaches the shared agent line,
      // so the leasing agent stays exercisable locally.
      expect(resolveListingCtaSmsPhone(ALICE), env).toBe(CLAW_LINE);
      expect(resolveListingCtaSmsPhone(BOB), env).toBe(CLAW_LINE);
      expect(resolveListingCtaSmsPhone(null), env).toBe(CLAW_LINE);
    }

    // No VERCEL_ENV (local `next dev` / vitest) falls back to NODE_ENV.
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    expect(listingCtaSendsToManagerOwnPhone()).toBe(false);
    expect(resolveListingCtaSmsPhone(ALICE)).toBe(CLAW_LINE);
  });

  it("falls back to the web links when a production manager has no usable phone", () => {
    setRuntime("production");
    // No phone at all.
    expect(resolveListingCtaSmsPhone(null)).toBeNull();
    expect(resolveListingCtaSmsPhone({})).toBeNull();
    expect(resolveListingCtaSmsPhone({ phone: "", phone_verified_at: "2026-01-01" })).toBeNull();
    // Unverified is forgeable (`/api/manager/phone` has no role gate).
    expect(resolveListingCtaSmsPhone({ ...ALICE, phone_verified_at: null })).toBeNull();
    // Unparseable, seed placeholder, and the shared line (nobody's own phone).
    expect(resolveListingCtaSmsPhone({ ...ALICE, phone: "call me" })).toBeNull();
    expect(resolveListingCtaSmsPhone({ ...ALICE, phone: "+12065550199" })).toBeNull();
    expect(resolveListingCtaSmsPhone({ ...ALICE, phone: CLAW_LINE })).toBeNull();
  });
});

describe("listing CTA rendering", () => {
  it("shows a well-formed sms: link only when a number resolved", () => {
    setRuntime("production");
    const managerPhone = resolveListingCtaSmsPhone(ALICE);
    expect(isClawMessagingPubliclyEnabled(managerPhone)).toBe(true);
    for (const intent of ["tour", "apply"] as const) {
      const href = buildSmsDeepLink({ intent, propertyLabel: "The Pioneer", toPhone: managerPhone });
      // `sms:+1XXXXXXXXXX?&body=…` — dialable on both iOS and Android.
      expect(href).toMatch(/^sms:\+1\d{10}\?&body=\S+$/);
      expect(href).toContain("sms:+14258909021");
      expect(href).not.toContain(CLAW_LINE);
    }

    const noPhone = resolveListingCtaSmsPhone({ ...ALICE, phone_verified_at: null });
    expect(noPhone).toBeNull();
    // The button is not rendered at all → "Schedule a tour" / "Apply online".
    expect(isClawMessagingPubliclyEnabled(noPhone)).toBe(false);
    expect(buildSmsDeepLink({ intent: "tour", propertyLabel: "The Pioneer", toPhone: noPhone })).toBe("#");
  });

  it("never leaves a stale stored number on a preview when none resolved", () => {
    setRuntime("production");
    const stored = { id: "mgr-1", contactSmsPhone: "+19995551234" } as unknown as MockProperty;
    expect(withListingContactSmsPhone(stored, resolveListingCtaSmsPhone(ALICE)).contactSmsPhone).toBe(
      "+14258909021",
    );
    expect(withListingContactSmsPhone(stored, null).contactSmsPhone).toBeUndefined();
  });
});
