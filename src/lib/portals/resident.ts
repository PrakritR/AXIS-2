import type { PortalDefinition } from "@/lib/portal-types";
import { RESIDENT_UNIFIED_PORTAL_SECTIONS, RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { cache } from "react";

const residentPortalUnified: PortalDefinition = {
  kind: "resident",
  basePath: RESIDENT_PORTAL_BASE_PATH,
  title: "Resident Portal",
  accent: "blue",
  sections: RESIDENT_UNIFIED_PORTAL_SECTIONS,
};

/** Full nav catalog; stage locks are applied in sidebar, route guards, and the bottom bar. */
export const getResidentPortalDefinition = cache(async (): Promise<PortalDefinition> => {
  return residentPortalUnified;
});
