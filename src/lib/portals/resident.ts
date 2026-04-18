import type { PortalDefinition } from "@/lib/portal-types";

/** Resident portal — matches marketing chrome + slim sidebar (dashboard + profile only while under review). */
export const residentPortal: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
