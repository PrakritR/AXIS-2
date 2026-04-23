/**
 * Resolve the app origin for Stripe return URLs.
 *
 * Prefer an explicit public app URL when it points to a non-local host.
 * Otherwise fall back to the current request origin so production deployments
 * do not accidentally send Stripe back to localhost.
 */
export function resolveAppOrigin(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      const host = parsed.hostname.toLowerCase();
      if (host !== "localhost" && host !== "127.0.0.1") {
        return parsed.origin;
      }
    } catch {
      /* ignore malformed env and fall back to request */
    }
  }

  return new URL(req.url).origin.replace(/\/$/, "");
}
