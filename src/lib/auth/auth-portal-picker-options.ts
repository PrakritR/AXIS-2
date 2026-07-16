import type { AuthRoleIconName } from "@/components/auth/auth-role-icons";

export type AuthPortalPickerId = "manager" | "resident" | "vendor";

export type AuthPortalPickerOption = {
  id: AuthPortalPickerId;
  label: string;
  hint: string;
  icon: AuthRoleIconName;
  tone: "blue" | "steel";
};

/** Shared copy for get-started and marketing auth choosers. */
export const AUTH_PORTAL_PICKER_OPTIONS: AuthPortalPickerOption[] = [
  {
    id: "manager",
    label: "Property",
    hint: "14-day Pro trial — list units & collect rent",
    icon: "manager",
    tone: "blue",
  },
  {
    id: "resident",
    label: "Resident",
    hint: "Apply, sign leases & pay rent",
    icon: "resident",
    tone: "steel",
  },
  {
    id: "vendor",
    label: "Vendor",
    hint: "Work orders, scheduling & payouts",
    icon: "vendor",
    tone: "blue",
  },
];
