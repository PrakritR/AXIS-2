import type { PortalDefinition, PortalKind } from "@/lib/portal-types";
import { adminPortal } from "./admin";
import { proPortal } from "./pro";
import { getResidentPortalDefinition } from "./resident";
import { vendorPortal } from "./vendor";
import { ownerPortal } from "./owner";

const portalsByKind: Record<Exclude<PortalKind, "resident">, PortalDefinition> = {
  pro: proPortal,
  manager: proPortal,
  admin: adminPortal,
  vendor: vendorPortal,
  owner: ownerPortal,
};

export async function getPortalDefinition(kind: PortalKind): Promise<PortalDefinition> {
  if (kind === "resident") return await getResidentPortalDefinition();
  return portalsByKind[kind];
}

export function findSection(def: PortalDefinition, section: string) {
  return def.sections.find((s) => s.section === section);
}
