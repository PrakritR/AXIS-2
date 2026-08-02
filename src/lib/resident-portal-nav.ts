import type { ResidentPortalAccessState } from "@/lib/resident-portal-access-types";

/** Resident mobile bottom bar + sidebar lock stages. */
export type ResidentPortalNavStage =
  | "pre_approval"
  | "application_submitted"
  | "post_approval_pre_lease"
  | "post_lease";

export function resolveResidentPortalNavStage(
  access: Pick<
    ResidentPortalAccessState,
    "leaseAccessUnlocked" | "applicationApproved" | "hasCompletedApplicationSubmission"
  >,
): ResidentPortalNavStage {
  if (access.leaseAccessUnlocked) return "post_lease";
  if (access.applicationApproved) return "post_approval_pre_lease";
  if (access.hasCompletedApplicationSubmission) return "application_submitted";
  return "pre_approval";
}

/** Fixed native bottom bar tabs per stage (Settings stays in the profile menu). */
export const RESIDENT_BOTTOM_NAV_PRIMARY: Record<ResidentPortalNavStage, readonly string[]> = {
  pre_approval: ["tour", "applications", "dashboard", "communication"],
  application_submitted: ["lease", "payments", "dashboard", "communication"],
  post_approval_pre_lease: ["lease", "payments", "dashboard", "communication"],
  post_lease: ["services", "payments", "dashboard", "communication"],
};

const STAGE_UNLOCKED_SECTIONS: Record<ResidentPortalNavStage, readonly string[]> = {
  pre_approval: ["tour", "applications", "dashboard", "communication", "profile"],
  application_submitted: ["tour", "applications", "dashboard", "communication", "profile"],
  post_approval_pre_lease: [
    "tour",
    "applications",
    "lease",
    "payments",
    "dashboard",
    "communication",
    "documents",
    "profile",
  ],
  post_lease: [
    "tour",
    "applications",
    "services",
    "payments",
    "dashboard",
    "communication",
    "lease",
    "move-in",
    "documents",
    "profile",
  ],
};

export function residentBottomNavPrimarySections(stage: ResidentPortalNavStage): readonly string[] {
  return RESIDENT_BOTTOM_NAV_PRIMARY[stage];
}

export function residentSectionUnlockedForStage(section: string, stage: ResidentPortalNavStage): boolean {
  return STAGE_UNLOCKED_SECTIONS[stage].includes(section);
}

export function residentSectionLockedForStage(section: string, stage: ResidentPortalNavStage): boolean {
  return !residentSectionUnlockedForStage(section, stage);
}

function residentPathSection(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[1] ?? "";
}

/** Client + server route guard — whether the resident may open this path at their stage. */
export function isResidentPathAllowedForAccess(
  pathname: string,
  access: Pick<
    ResidentPortalAccessState,
    "leaseAccessUnlocked" | "applicationApproved" | "hasCompletedApplicationSubmission"
  >,
): boolean {
  const stage = resolveResidentPortalNavStage(access);
  if (pathname === "/resident/profile" || pathname.startsWith("/resident/profile/")) return true;

  const section = residentPathSection(pathname);
  if (!section) return false;

  if (section === "communication" || pathname.startsWith("/resident/communication/")) {
    return residentSectionUnlockedForStage("communication", stage);
  }

  if (section === "applications" || pathname.startsWith("/resident/applications/")) {
    return residentSectionUnlockedForStage("applications", stage);
  }

  return residentSectionUnlockedForStage(section, stage);
}

export function residentNavLockReason(
  section: string,
  stage: ResidentPortalNavStage,
): string | null {
  if (!residentSectionLockedForStage(section, stage)) return null;
  if (stage === "pre_approval") {
    if (section === "lease" || section === "payments") {
      return "Available after you submit an application";
    }
    return "Available after your application is approved";
  }
  if (stage === "application_submitted") {
    if (section === "lease" || section === "payments") {
      return "Available after your application is approved";
    }
    return "Available after your application is approved";
  }
  if (stage === "post_approval_pre_lease") {
    if (section === "services" || section === "move-in") {
      return "Available after your lease is signed";
    }
    return "Available after your lease is signed";
  }
  return "Unavailable";
}

/** Default resident landing route after sign-in / account creation. */
export function residentPortalHomePath(
  access: Pick<
    ResidentPortalAccessState,
    "leaseAccessUnlocked" | "applicationApproved" | "hasTourLink" | "hasSubmittedApplication"
  >,
): string {
  if (access.leaseAccessUnlocked) return "/resident/dashboard";
  if (access.applicationApproved) return "/resident/dashboard";
  if (access.hasTourLink && !access.hasSubmittedApplication) return "/resident/tour";
  if (!access.hasSubmittedApplication) return "/resident/applications/apply";
  return "/resident/dashboard";
}
