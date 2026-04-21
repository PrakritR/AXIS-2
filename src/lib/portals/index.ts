import type { PortalDefinition, PortalKind } from "@/lib/portal-types";
import { adminPortal } from "./admin";
import { managerPortal } from "./manager";
import { ownerPortal } from "./owner";
import { proPortal } from "./pro";
import { getResidentPortalDefinition } from "./resident";

const portalsByKind: Record<Exclude<PortalKind, "resident">, PortalDefinition> = {
  pro: proPortal,
  manager: managerPortal,
  owner: ownerPortal,
  admin: adminPortal,
};

export async function getPortalDefinition(kind: PortalKind): Promise<PortalDefinition> {
  if (kind === "resident") return await getResidentPortalDefinition();
  return portalsByKind[kind];
}

export function findSection(def: PortalDefinition, section: string) {
  return def.sections.find((s) => s.section === section);
}
