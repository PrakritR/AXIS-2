/** Safe in-app path for Google OAuth connect/callback return (no open redirect). */
export function sanitizeOAuthReturnPath(path: string | null | undefined, fallback: string): string {
  const trimmed = path?.trim() ?? "";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  const pathname = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (!pathname.startsWith("/auth/") && !pathname.startsWith("/portal/")) return fallback;
  return pathname || fallback;
}
