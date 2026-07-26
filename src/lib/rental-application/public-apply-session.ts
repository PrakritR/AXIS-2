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
