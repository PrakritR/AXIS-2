import type { PortalDefinition } from "@/lib/portal-types";
import { adminPortal } from "./admin";
import { managerPortal } from "./manager";
import { residentPortal } from "./resident";

export const portalsByKind: Record<PortalDefinition["kind"], PortalDefinition> = {
  manager: managerPortal,
  resident: residentPortal,
  admin: adminPortal,
};

export function getPortalDefinition(kind: PortalDefinition["kind"]) {
  return portalsByKind[kind];
}

export function findSection(def: PortalDefinition, section: string) {
  return def.sections.find((s) => s.section === section);
}
