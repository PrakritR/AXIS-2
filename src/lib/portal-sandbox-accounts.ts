/** Emails used for the public `/demo` sandbox and production demo seeds — hidden from real portal admin views. */
export function isPortalSandboxEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized.includes("@")) return false;
  return normalized.endsWith("@axis.local") || normalized.endsWith("@test.axis.local");
}
