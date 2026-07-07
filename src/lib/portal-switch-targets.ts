import type { AuthRole } from "@/components/auth/portal-switcher";
import type { PortalKind } from "@/lib/portal-types";

export type PortalSwitchTarget = {
  role: AuthRole;
  label: string;
};

/** Sidebar / account-menu destinations for users with multiple portal roles. */
export function portalSwitchTargets(currentKind: PortalKind, roles: AuthRole[]): PortalSwitchTarget[] {
  const has = (role: AuthRole) => roles.includes(role);
  const targets: PortalSwitchTarget[] = [];
  const inAdmin = currentKind === "admin";
  const inProperty = currentKind === "manager" || currentKind === "pro";
  const inResident = currentKind === "resident";
  const inVendor = currentKind === "vendor";

  if (inAdmin && has("manager")) {
    targets.push({ role: "manager", label: "Switch to Property portal" });
  }
  if (inProperty && has("admin")) {
    targets.push({ role: "admin", label: "Switch to Admin portal" });
  }
  if (inProperty && has("resident")) {
    targets.push({ role: "resident", label: "Switch to Resident portal" });
  }
  if (inResident && has("manager")) {
    targets.push({ role: "manager", label: "Switch to Property portal" });
  }
  if (inAdmin && has("resident")) {
    targets.push({ role: "resident", label: "Switch to Resident portal" });
  }
  if (inResident && has("admin")) {
    targets.push({ role: "admin", label: "Switch to Admin portal" });
  }
  if (inAdmin && has("vendor")) {
    targets.push({ role: "vendor", label: "Switch to Vendor portal" });
  }
  if (inVendor && has("admin")) {
    targets.push({ role: "admin", label: "Switch to Admin portal" });
  }
  if (inProperty && has("vendor")) {
    targets.push({ role: "vendor", label: "Switch to Vendor portal" });
  }
  if (inVendor && has("manager")) {
    targets.push({ role: "manager", label: "Switch to Property portal" });
  }

  return targets;
}
