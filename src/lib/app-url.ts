/**
 * Resolve the app origin for Stripe return URLs.
 *
 * When the request comes from localhost, always use that origin so local checkout
 * does not redirect to production (NEXT_PUBLIC_APP_URL) after payment.
 *
 * Otherwise prefer an explicit public app URL when it points to a non-local host,
 * falling back to the request origin for production deployments.
 */
export function resolveAppOrigin(req: Request): string {
  const requestOrigin = new URL(req.url).origin.replace(/\/$/, "");
  try {
    const requestHost = new URL(requestOrigin).hostname.toLowerCase();
    if (requestHost === "localhost" || requestHost === "127.0.0.1") {
      return requestOrigin;
    }
  } catch {
    /* ignore malformed request URL */
  }

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

  return requestOrigin;
}
