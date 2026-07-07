import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access-server";
import type { PortalDefinition } from "@/lib/portal-types";
import {
  RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS,
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
  RESIDENT_PORTAL_BASE_PATH,
} from "@/lib/portals/resident-sections";
import { loadResidentPortalAccessState } from "@/lib/resident-portal-access";
import { cache } from "react";

const residentPortalApplicationPhase: PortalDefinition = {
  kind: "resident",
  basePath: RESIDENT_PORTAL_BASE_PATH,
  title: "Resident Portal",
  accent: "blue",
  sections: RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS,
};

const residentPortalLimited: PortalDefinition = {
  kind: "resident",
  basePath: RESIDENT_PORTAL_BASE_PATH,
  title: "Resident Portal",
  accent: "blue",
  sections: RESIDENT_LIMITED_PORTAL_SECTIONS,
};

const residentPortalApproved: PortalDefinition = {
  kind: "resident",
  basePath: RESIDENT_PORTAL_BASE_PATH,
  title: "Resident Portal",
  accent: "blue",
  sections: RESIDENT_APPROVED_PORTAL_SECTIONS,
};

export const getResidentPortalDefinition = cache(async (): Promise<PortalDefinition> => {
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
  if (!access.leaseAccessUnlocked) return residentPortalApplicationPhase;
  return residentPortalApproved;
});
