import { isProductionAxisHost } from "@/lib/auth/native-auth-entry";

/**
 * True on the live production site (axis-seattle-housing.com) and on Vercel
 * Production deploys. Used to filter sandbox listings from the public rent
 * catalog — not to hide the /demo sandbox itself.
 */
export function isProductionPublicSite(): boolean {
  if (typeof window !== "undefined") {
    if (isProductionAxisHost(window.location.hostname)) return true;
  }
  if (process.env.VERCEL_ENV === "production") return true;
  return false;
}

/** Demo nav, landing CTA, and /demo route. Opt out with NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED=false. */
export function isPublicDemoSurfaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED !== "false";
}
