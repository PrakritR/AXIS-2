function trimOrigin(url: string | undefined): string {
  return url?.trim().replace(/\/$/, "") ?? "";
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function isVercelDeploymentHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".vercel.app");
}

/**
 * Origin for shareable links (invites). Prefers a canonical custom domain
 * over the default *.vercel.app deployment URL.
 */
export function resolveShareableAppOrigin(browserOrigin?: string): string {
  const canonical = trimOrigin(process.env.NEXT_PUBLIC_CANONICAL_APP_URL);
  if (canonical) return canonical;

  const browser = trimOrigin(browserOrigin);
  if (browser) {
    try {
      const host = new URL(browser).hostname;
      if (!isLocalHost(host) && !isVercelDeploymentHost(host)) {
        return browser;
      }
    } catch {
      /* ignore malformed browser origin */
    }
  }

  const env = trimOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (env) {
    try {
      const host = new URL(env).hostname;
      if (!isVercelDeploymentHost(host)) return env;
    } catch {
      return env;
    }
  }

  return browser || env || "http://localhost:3000";
}

/**
 * Origin the browser actually requested, derived from the Host header.
 *
 * The dev server binds 0.0.0.0 (`next dev --hostname 0.0.0.0`) and `request.url`
 * reflects that bind address, not the Host header — so absolute URLs built from
 * `request.url` bounce a localhost user to 0.0.0.0, a different cookie host where
 * their session doesn't exist. Trust `x-forwarded-*` first (Vercel), then Host,
 * falling back to the request URL's own origin.
 */
export function resolveRequestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (!host) return url.origin;
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

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
  const requestOrigin = resolveRequestOrigin(req).replace(/\/$/, "");
  try {
    const requestHost = new URL(requestOrigin).hostname.toLowerCase();
    if (isLocalHost(requestHost)) {
      return requestOrigin;
    }
  } catch {
    /* ignore malformed request URL */
  }

  const shareable = resolveShareableAppOrigin(requestOrigin);
  if (shareable !== "http://localhost:3000") {
    try {
      const host = new URL(shareable).hostname;
      if (!isLocalHost(host)) return shareable;
    } catch {
      /* fall through */
    }
  }

  const envUrl = trimOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      if (!isLocalHost(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      /* ignore malformed env and fall back to request */
    }
  }

  return requestOrigin;
}
