import "server-only";

import { authorizeResidentRole } from "@/lib/auth/resident-role-access";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceRoleDb = ReturnType<typeof createSupabaseServiceRoleClient>;

export type InboxPortalKind = "manager" | "resident" | "vendor";

function isManagerLikeRole(role: string | null): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "manager" || r === "owner" || r === "pro" || r === "admin";
}

/**
 * Resolve which inbox scope a portal send/compose should use. Multi-role accounts
 * created as managers must still message their property manager from the resident
 * portal — the legacy `profiles.role` alone is wrong there.
 */
export async function resolveInboxSenderRoleForPortal(
  db: ServiceRoleDb,
  params: {
    userId: string;
    legacyRole: string | null | undefined;
    portal: InboxPortalKind;
    isAdmin: boolean;
  },
): Promise<string | null> {
  if (params.isAdmin) return "admin";

  const legacy = String(params.legacyRole ?? "").trim().toLowerCase() || null;
  const [isResident, roleRows] = await Promise.all([
    authorizeResidentRole(db, { userId: params.userId, legacyRole: legacy }),
    db.from("profile_roles").select("role").eq("user_id", params.userId),
  ]);
  const roles = (roleRows.data ?? []).map((row) => String(row.role ?? "").trim().toLowerCase()).filter(Boolean);
  const isManager =
    roles.some((role) => role === "manager" || role === "admin") || isManagerLikeRole(legacy);
  const isVendor = roles.includes("vendor") || legacy === "vendor";

  if (params.portal === "resident" && isResident) return "resident";
  if (params.portal === "vendor" && isVendor) return "vendor";
  if (params.portal === "manager" && isManager) return legacy === "admin" || roles.includes("admin") ? "admin" : "manager";

  if (isManager && isResident) return params.portal === "resident" ? "resident" : "manager";
  if (isManager) return legacy === "admin" || roles.includes("admin") ? "admin" : "manager";
  if (isResident) return "resident";
  if (isVendor) return "vendor";
  return legacy;
}
