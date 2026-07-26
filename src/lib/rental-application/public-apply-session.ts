const GUEST_CONTINUE_PREFIX = "proplane_apply_guest_continue:";

/** Remember that the applicant chose to apply without signing in (per listing). */
export function markPublicApplyGuestContinue(propertyId: string): void {
  if (typeof window === "undefined") return;
  const pid = propertyId.trim();
  if (!pid) return;
  try {
    window.sessionStorage.setItem(`${GUEST_CONTINUE_PREFIX}${pid}`, "1");
  } catch {
    /* ignore */
  }
}

export function hasPublicApplyGuestContinue(propertyId: string): boolean {
  if (typeof window === "undefined") return false;
  const pid = propertyId.trim();
  if (!pid) return false;
  try {
    return window.sessionStorage.getItem(`${GUEST_CONTINUE_PREFIX}${pid}`) === "1";
  } catch {
    return false;
  }
}

export function publicApplySignInHref(propertyId: string): string {
  const next = `/rent/apply?propertyId=${encodeURIComponent(propertyId.trim())}`;
  return `/auth/sign-in?intent=resident&next=${encodeURIComponent(next)}`;
}

export type PublicApplyView = "account-prompt" | "signed-in-create-resident" | "wizard";

/**
 * Decide what the public apply surface renders when a property link is present:
 *
 *  - SIGNED OUT → the anonymous "Before you apply" account prompt (sign in /
 *    continue as guest), owned by the public-apply gate.
 *  - SIGNED IN but NOT a resident (a manager or vendor — residents are
 *    redirected to the portal apply flow before this surface mounts) → the
 *    "create your resident account" prompt: they add a separate resident
 *    account to their existing login and apply from the resident portal. This
 *    is the branch whose absence rendered a blank content area — a signed-in
 *    non-resident matched no case and saw nothing.
 *  - GUEST chosen, or no property link → the wizard directly.
 */
export function resolvePublicApplyView(input: {
  propertyId: string;
  guestContinue: boolean;
  signedInNonResident: boolean;
}): PublicApplyView {
  const gateInPlay = Boolean(input.propertyId.trim()) && !input.guestContinue;
  if (!gateInPlay) return "wizard";
  return input.signedInNonResident ? "signed-in-create-resident" : "account-prompt";
}
