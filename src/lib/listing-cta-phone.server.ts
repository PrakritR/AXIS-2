import "server-only";
import {
  isFictionalUs555Number,
  isLegacyClawSharedSmsNumber,
  managerContactSmsPhoneForPublicCta,
} from "@/lib/claw-leasing-links";
import { normalizePhoneE164 } from "@/lib/communication-other-recipients";
import { isProductionRuntime } from "@/lib/server-env";

/**
 * Where a public listing's "Text to tour" / "Text to apply" CTA sends a
 * prospect. THIS MODULE OWNS THE ENVIRONMENT SPLIT — it is the only place the
 * branch is made, and everything downstream just carries the number it returns.
 *
 *   PRODUCTION            → the property's OWN manager's verified personal phone.
 *   localhost / preview / test → the shared Claw Messenger leasing line (unchanged).
 *
 * Why: the Twilio A2P campaign is still in carrier review, so the platform's
 * own leasing number cannot reliably carry production traffic yet. Routing
 * prospects straight to the manager is a deliberate interim measure until A2P
 * clears — flip `listingCtaSendsToManagerOwnPhone` back to `false` (or delete
 * this branch) to return production to the shared line.
 *
 * Development keeps the Claw line so the leasing-agent flow
 * (`handleClawLeasingInbound` → `leasing-sms-agent.server.ts`) stays
 * exercisable locally; see `docs/agents/sms-system.md`.
 */
export function listingCtaSendsToManagerOwnPhone(): boolean {
  return isProductionRuntime();
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
  if (!listingCtaSendsToManagerOwnPhone()) {
    // Dev / preview / test: unchanged Claw path. Under the Claw shared-line
    // bridge this resolves to the agent line for every listing, including when
    // no manager profile could be loaded.
    return managerContactSmsPhoneForPublicCta(manager?.sms_from_number ?? null);
  }

  // Production: the manager's own cell. Only a VERIFIED phone counts —
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
