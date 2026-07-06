/** Emails used for the public `/demo` sandbox and production demo seeds — hidden from real portal admin views. */
export function isPortalSandboxEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized.includes("@")) return false;
  return normalized.endsWith("@axis.local") || normalized.endsWith("@test.axis.local");
}

/** Block co-manager / property links that would mix demo sandbox accounts with real portal users. */
export function isCrossSandboxPortalPair(
  emailA: string | null | undefined,
  emailB: string | null | undefined,
): boolean {
  return isPortalSandboxEmail(emailA) !== isPortalSandboxEmail(emailB);
}

export const CROSS_SANDBOX_PORTAL_PAIR_ERROR =
  "Demo sandbox accounts cannot link with real portal accounts.";
