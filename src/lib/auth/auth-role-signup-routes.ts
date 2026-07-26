import type { AuthPortalPickerId } from "@/lib/auth/auth-portal-picker-options";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";

/** Canonical create-account URL for a portal role (manager, resident, vendor). */
export function authCreateAccountPath(role: AuthPortalPickerId, mode: "create" | "sign-in" = "create"): string {
  const params = new URLSearchParams();
  if (mode === "create") params.set("mode", "create");
  params.set("role", role);
  return `/auth/create-account?${params.toString()}`;
}

export function authCreateAccountHref(role: AuthPortalPickerId): string {
  return nativeAwarePath(authCreateAccountPath(role, "create"));
}
