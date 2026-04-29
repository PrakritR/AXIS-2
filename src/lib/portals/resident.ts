import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access";
import type { PortalDefinition } from "@/lib/portal-types";
import { loadResidentPortalAccessState } from "@/lib/resident-portal-access";

const residentPortalLimited: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "opened", label: "Opened" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
      ],
    },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

const residentPortalApproved: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "lease", label: "Lease", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "opened", label: "Opened" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
      ],
    },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

export async function getResidentPortalDefinition(): Promise<PortalDefinition> {
  const { profile, user } = await getEffectiveSessionForPortal("resident");
  const managerSubscriptionTier = profile?.manager_id?.trim()
    ? await getManagerSubscriptionTierByManagerId(profile.manager_id.trim())
    : null;
  const access = await loadResidentPortalAccessState({
    userId: user?.id ?? null,
    role: profile?.role,
    email: profile?.email ?? user?.email ?? null,
    managerSubscriptionTier,
  });
  if (access.leaseAccessUnlocked) return residentPortalApproved;
  return residentPortalLimited;
}
