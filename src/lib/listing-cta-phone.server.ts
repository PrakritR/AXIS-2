import "server-only";
import {
  isFictionalUs555Number,
  isLegacyClawSharedSmsNumber,
} from "@/lib/claw-leasing-links";
import { normalizePhoneE164 } from "@/lib/communication-other-recipients";

/**
 * A public listing's "Text to tour" / "Text to apply" CTA always targets that
 * property's own manager's verified phone. The retired shared Claw line is
 * never a fallback in production, preview, development, or tests.
 */
export function listingCtaSendsToManagerOwnPhone(): boolean {
  return true;
}

/** The `profiles` columns `resolveListingCtaSmsPhone` needs. */
export type ListingCtaManagerProfile = {
  phone?: string | null;
  phone_verified_at?: string | null;
  sms_from_number?: string | null;
};

/**
 * Resolve the `sms:` target for ONE property, from ITS OWN manager's profile.
 *
 * Callers must pass the profile of the manager who owns that specific listing —
 * never a catalog-wide default — so a multi-manager fleet can never cross-route
 * a prospect to the wrong manager's phone.
 *
 * Returns `null` when there is no usable number. That is not an error: the CTA
 * components fall back to the "Schedule a tour" / "Apply online" web links that
 * already sit under those buttons, so no dead `sms:` link is ever rendered.
 */
export function resolveListingCtaSmsPhone(
  manager: ListingCtaManagerProfile | null | undefined,
): string | null {
  // The manager's own cell. Only a VERIFIED phone counts —
  // `profiles.phone` is user-editable through `/api/manager/phone` with no role
  // gate, so an unverified value is forgeable (same rule as
  // `resolveRegisteredClawManagers`).
  if (!manager?.phone_verified_at) return null;
  const e164 = normalizePhoneE164(String(manager.phone ?? ""));
  if (!e164) return null;
  // Seed placeholders, and the shared agent line (which is stamped onto every
  // manager's `sms_from_number` and so is nobody's *own* phone).
  if (isFictionalUs555Number(e164)) return null;
  if (isLegacyClawSharedSmsNumber(e164)) return null;
  return e164;
}
