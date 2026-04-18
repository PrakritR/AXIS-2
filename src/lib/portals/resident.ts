import type { PortalDefinition } from "@/lib/portal-types";
import { getServerSessionProfile } from "@/lib/auth/server-profile";

const residentPortalUnderReview: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

const residentPortalApproved: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "lease", label: "Lease", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "inbox", label: "Inbox", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

export async function getResidentPortalDefinition(): Promise<PortalDefinition> {
  const { profile } = await getServerSessionProfile();
  const approved = profile?.application_approved ?? false;
  return approved ? residentPortalApproved : residentPortalUnderReview;
}
