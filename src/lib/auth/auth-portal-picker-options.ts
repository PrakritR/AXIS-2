import type { AuthRole } from "@/components/auth/portal-switcher";
import type { AuthRoleIconName } from "@/components/auth/auth-role-icons";

export type AuthPortalPickerId = "manager" | "resident" | "vendor";

export type AuthPortalPickerOption = {
  id: AuthPortalPickerId;
  label: string;
  hint: string;
  /** Longer copy for the signed-in get-started chooser. */
  chooserLabel: string;
  chooserHint: string;
  icon: AuthRoleIconName;
  tone: "blue" | "steel";
};

/** Shared copy for get-started and marketing auth choosers. */
export const AUTH_PORTAL_PICKER_OPTIONS: AuthPortalPickerOption[] = [
  {
    id: "manager",
    label: "Property",
    hint: "14-day Pro trial — list units & collect rent",
    chooserLabel: "Set up as a property manager",
    chooserHint: "List properties, screen applicants & collect rent",
    icon: "manager",
    tone: "blue",
  },
  {
    id: "resident",
    label: "Resident",
    hint: "Apply, sign leases & pay rent",
    chooserLabel: "I'm applying to rent",
    chooserHint: "Apply to a home, then continue from your email setup link",
    icon: "resident",
    tone: "blue",
  },
  {
    id: "vendor",
    label: "Vendor",
    hint: "Work orders, scheduling & payouts",
    chooserLabel: "Join as a service vendor",
    chooserHint: "Bid on jobs, schedule visits & get paid",
    icon: "vendor",
    tone: "blue",
  },
];

const PICKER_ROLE_IDS = new Set<AuthPortalPickerId>(AUTH_PORTAL_PICKER_OPTIONS.map((opt) => opt.id));

function isAuthPortalPickerId(role: AuthRole): role is AuthPortalPickerId {
  return PICKER_ROLE_IDS.has(role as AuthPortalPickerId);
}

/** Portal types a signed-in user can still add (excludes roles they already have). */
export function filterAddablePortalPickerOptions(existingRoles: readonly AuthRole[]): AuthPortalPickerOption[] {
  const owned = new Set(
    existingRoles.filter(isAuthPortalPickerId),
  );
  return AUTH_PORTAL_PICKER_OPTIONS.filter((opt) => !owned.has(opt.id));
}
