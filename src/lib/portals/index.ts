import type { PortalDefinition, PortalKind } from "@/lib/portal-types";
import { adminPortal } from "./admin";
import { managerPortal } from "./manager";
import { ownerPortal } from "./owner";
import { getResidentPortalDefinition } from "./resident";

const portalsByKind: Record<Exclude<PortalKind, "resident">, PortalDefinition> = {
  manager: managerPortal,
  owner: ownerPortal,
  admin: adminPortal,
};

export function getPortalDefinition(kind: PortalKind): PortalDefinition {
  if (kind === "resident") return getResidentPortalDefinition();
  return portalsByKind[kind];
}

export function findSection(def: PortalDefinition, section: string) {
  return def.sections.find((s) => s.section === section);
}
