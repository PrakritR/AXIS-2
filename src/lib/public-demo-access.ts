import { isProductionAxisHost } from "@/lib/auth/native-auth-entry";

/**
 * True on the live production site (axis-seattle-housing.com) and on Vercel
 * Production deploys. Used to hide demo nav, sandbox browse listings, and /demo
 * CTAs while keeping them on local dev and preview/staging.
 */
export function isProductionPublicSite(): boolean {
  if (typeof window !== "undefined") {
    if (isProductionAxisHost(window.location.hostname)) return true;
  }
  if (process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED === "false") return true;
  if (process.env.VERCEL_ENV === "production") return true;
  return false;
}

export function isPublicDemoSurfaceEnabled(): boolean {
  return !isProductionPublicSite();
}
