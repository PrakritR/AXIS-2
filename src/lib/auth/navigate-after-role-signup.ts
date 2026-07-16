"use client";

import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";

/**
 * After adding a portal role (signup or get-started), route through the server
 * resolver so multi-role accounts land on choose-portal instead of one dashboard.
 */
export async function navigateAfterRoleSignup(fallbackPath: string): Promise<void> {
  const safeFallback = fallbackPath.startsWith("/") ? fallbackPath : "/auth/choose-portal";
  const { redirectTo, resolutionFailed } = await resolvePostAuthDestination("/auth/continue");
  const dest = redirectTo?.startsWith("/") ? redirectTo : safeFallback;
  if (resolutionFailed && !redirectTo) {
    window.location.replace(nativeAwarePath(safeFallback));
    return;
  }
  window.location.replace(nativeAwarePath(dest));
}
