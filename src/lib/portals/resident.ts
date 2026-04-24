import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access";
import type { PortalDefinition } from "@/lib/portal-types";
import { residentHasFullPortalAccess } from "@/lib/resident-portal-access";

const residentPortalUnderReview: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
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
    { section: "payments", label: "Payments", tabs: [] },
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

const residentPortalApprovedLimited: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
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
  const unlocked = residentHasFullPortalAccess({
    applicationApproved: profile?.application_approved ?? false,
    role: profile?.role,
    email: profile?.email ?? user?.email ?? null,
    managerSubscriptionTier,
  });
  if (unlocked) return residentPortalApproved;
  if (profile?.application_approved) return residentPortalApprovedLimited;
  return residentPortalUnderReview;
}
