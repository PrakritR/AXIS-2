import type { PortalDefinition } from "@/lib/portal-types";
import { isResidentApplicationApproved } from "./resident-state";

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
    { section: "leases", label: "Leases", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "inbox", label: "Inbox", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

export function getResidentPortalDefinition(): PortalDefinition {
  return isResidentApplicationApproved() ? residentPortalApproved : residentPortalUnderReview;
}
