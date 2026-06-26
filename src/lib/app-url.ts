function trimOrigin(url: string | undefined): string {
  return url?.trim().replace(/\/$/, "") ?? "";
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function isVercelDeploymentHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".vercel.app");
}

/**
 * Origin for shareable links (onboarding, invites). Prefers a canonical custom domain
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
