/** Public marketing paths for resident browse + portal entry. */

export const RESIDENT_BROWSE_PATH = "/rent/browse";
export const RESIDENT_APPLICATIONS_PATH = "/resident/applications";

/** Resident create-account → public browse (no auth required). */
export function residentBrowseFromAuthHref(): string {
  return `${RESIDENT_BROWSE_PATH}?from=auth`;
}

/** In-portal application wizard → browse listings, then return to apply. */
export function residentBrowseFromApplicationHref(returnPath = `${RESIDENT_APPLICATIONS_PATH}/apply`): string {
  const next = returnPath.startsWith("/") ? returnPath : `${RESIDENT_APPLICATIONS_PATH}/apply`;
  const q = new URLSearchParams({ from: "application", return: next });
  return `${RESIDENT_BROWSE_PATH}?${q.toString()}`;
}

export function residentCreateAccountHref(
  nextPath = RESIDENT_APPLICATIONS_PATH,
  opts?: {
    email?: string;
    fullName?: string;
    phone?: string;
    tourInquiryId?: string;
    /** Post-tour or post-message handoff — routes signup and inbox linking. */
    handoff?: "message";
  },
): string {
  const tourInquiryId = opts?.tourInquiryId?.trim();
  const baseNext = nextPath.startsWith("/") ? nextPath : RESIDENT_APPLICATIONS_PATH;
  const next =
    tourInquiryId && !baseNext.includes("link_tour=")
      ? `/resident/tour?link_tour=${encodeURIComponent(tourInquiryId)}`
      : baseNext;
  const q = new URLSearchParams({ mode: "create", role: "resident", next });
  const email = opts?.email?.trim().toLowerCase();
  if (email) q.set("email", email);
  const fullName = opts?.fullName?.trim();
  if (fullName) q.set("name", fullName);
  const phone = opts?.phone?.trim();
  if (phone) q.set("phone", phone);
  if (tourInquiryId) q.set("tour_inquiry", tourInquiryId);
  if (opts?.handoff === "message") q.set("handoff", "message");
  return `/auth/create-account?${q.toString()}`;
}

export function residentSignInHref(
  nextPath = RESIDENT_APPLICATIONS_PATH,
  opts?: {
    tourInquiryId?: string;
    email?: string;
    fullName?: string;
    phone?: string;
  },
): string {
  const baseNext = nextPath.startsWith("/") ? nextPath : RESIDENT_APPLICATIONS_PATH;
  const tourInquiryId = opts?.tourInquiryId?.trim();
  // Post-auth routing only forwards `next` through /auth/continue — embed link_tour
  // there so ResidentTourLinkOnMount runs inside the resident layout.
  const next = tourInquiryId
    ? `/resident/tour?link_tour=${encodeURIComponent(tourInquiryId)}`
    : baseNext;
  const q = new URLSearchParams({ intent: "resident", next });
  const email = opts?.email?.trim().toLowerCase();
  if (email) q.set("email", email);
  const fullName = opts?.fullName?.trim();
  if (fullName) q.set("name", fullName);
  const phone = opts?.phone?.trim();
  if (phone) q.set("phone", phone);
  if (tourInquiryId) q.set("tour_inquiry", tourInquiryId);
  return `/auth/sign-in?${q.toString()}`;
}

/** In-portal tour list → browse listings, then schedule from a property page. */
export function residentBrowseForTourHref(): string {
  const q = new URLSearchParams({ from: "resident-tour", return: "/resident/tour/pending" });
  return `${RESIDENT_BROWSE_PATH}?${q.toString()}`;
}

export function residentPortalPublicHref(opts: {
  signedIn: boolean;
  isResident: boolean;
  nextPath?: string;
}): string {
  const next = opts.nextPath?.startsWith("/") ? opts.nextPath : RESIDENT_APPLICATIONS_PATH;
  if (opts.signedIn && opts.isResident) return next;
  if (opts.signedIn && !opts.isResident) return residentCreateAccountHref(next);
  return residentSignInHref(next);
}
