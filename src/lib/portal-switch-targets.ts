import type { AuthRole } from "@/components/auth/portal-switcher";
import type { PortalKind } from "@/lib/portal-types";

export type PortalSwitchTarget = {
  role: AuthRole;
  label: string;
};

const PORTAL_SWITCH_LABELS: Record<AuthRole, string> = {
  manager: "Switch to Property portal",
  admin: "Switch to Admin portal",
  resident: "Switch to Resident portal",
  vendor: "Switch to Vendor portal",
  owner: "Switch to Owner portal",
};

const KIND_ACTIVE_ROLE: Record<PortalKind, AuthRole> = {
  pro: "manager",
  manager: "manager",
  admin: "admin",
  resident: "resident",
  vendor: "vendor",
  owner: "owner",
};

/** Stable display order when multiple portal switches are shown. */
const SWITCH_ORDER: AuthRole[] = ["manager", "admin", "resident", "vendor", "owner"];

/** Sidebar / account-menu destinations for users with multiple portal roles. */
export function portalSwitchTargets(currentKind: PortalKind, roles: AuthRole[]): PortalSwitchTarget[] {
  const active = KIND_ACTIVE_ROLE[currentKind];
  const roleSet = new Set(roles);
  return SWITCH_ORDER.filter((role) => role !== active && roleSet.has(role)).map((role) => ({
    role,
    label: PORTAL_SWITCH_LABELS[role],
  }));
}
