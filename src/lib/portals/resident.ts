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
    { section: "payments", label: "Payments", tabs: [] },
    { section: "move-in", label: "Move-in", tabs: [] },
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
    {
      section: "documents",
      label: "Documents",
      tabs: [{ id: "receipts", label: "Rent receipts" }],
    },
    {
      section: "financials",
      label: "Finances",
      tabs: [
        { id: "summary", label: "Summary" },
        { id: "statements", label: "Rent statements" },
      ],
    },
    { section: "bugs-feedback", label: "Feedback", tabs: [] },
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
    { section: "payments", label: "Payments", tabs: [] },
    { section: "move-in", label: "Move-in", tabs: [] },
    {
      section: "services",
      label: "Services",
      tabs: [
        { id: "requests", label: "Requests" },
        { id: "work-orders", label: "Work orders" },
      ],
    },
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
    {
      section: "documents",
      label: "Documents",
      tabs: [
        { id: "lease", label: "Lease" },
        { id: "receipts", label: "Rent receipts" },
      ],
    },
    {
      section: "financials",
      label: "Finances",
      tabs: [
        { id: "summary", label: "Summary" },
        { id: "statements", label: "Rent statements" },
      ],
    },
    { section: "bugs-feedback", label: "Feedback", tabs: [] },
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
