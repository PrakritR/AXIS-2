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
  opts?: { email?: string },
): string {
  const next = nextPath.startsWith("/") ? nextPath : RESIDENT_APPLICATIONS_PATH;
  const q = new URLSearchParams({ role: "resident", next });
  const email = opts?.email?.trim().toLowerCase();
  if (email) q.set("email", email);
  return `/auth/create-account?${q.toString()}`;
}

export function residentSignInHref(nextPath = RESIDENT_APPLICATIONS_PATH): string {
  const next = nextPath.startsWith("/") ? nextPath : RESIDENT_APPLICATIONS_PATH;
  return `/auth/sign-in?intent=resident&next=${encodeURIComponent(next)}`;
}

/** Browse / portal CTA — signed-in residents land in portal; everyone else is routed to resident auth. */
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
