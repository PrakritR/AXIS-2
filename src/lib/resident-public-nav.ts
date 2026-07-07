/** Public marketing paths for resident browse + portal entry. */

export const RESIDENT_BROWSE_PATH = "/rent/browse";
export const RESIDENT_APPLICATIONS_PATH = "/resident/applications";

export function residentCreateAccountHref(nextPath = RESIDENT_APPLICATIONS_PATH): string {
  const next = nextPath.startsWith("/") ? nextPath : RESIDENT_APPLICATIONS_PATH;
  return `/auth/create-account?role=resident&next=${encodeURIComponent(next)}`;
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
