import type { ResidentPortalAccessState } from "@/lib/resident-portal-access-types";

/** Resident mobile bottom bar + sidebar lock stages. */
export type ResidentPortalNavStage = "pre_approval" | "post_approval_pre_lease" | "post_lease";

export function resolveResidentPortalNavStage(
  access: Pick<ResidentPortalAccessState, "leaseAccessUnlocked" | "applicationApproved">,
): ResidentPortalNavStage {
  if (access.leaseAccessUnlocked) return "post_lease";
  if (access.applicationApproved) return "post_approval_pre_lease";
  return "pre_approval";
}

/** Fixed native bottom bar tabs per stage (Settings stays in the profile menu). */
export const RESIDENT_BOTTOM_NAV_PRIMARY: Record<ResidentPortalNavStage, readonly string[]> = {
  pre_approval: ["tour", "applications", "dashboard", "communication"],
  post_approval_pre_lease: ["lease", "payments", "dashboard", "communication"],
  post_lease: ["services", "payments", "dashboard", "communication"],
};

const STAGE_UNLOCKED_SECTIONS: Record<ResidentPortalNavStage, readonly string[]> = {
  pre_approval: ["tour", "applications", "dashboard", "communication", "profile"],
  post_approval_pre_lease: ["lease", "payments", "dashboard", "communication", "documents", "profile"],
  post_lease: [
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

/** Sections locked after application approval (still visible in nav with a lock). */
const LOCKED_AFTER_APPLICATION_APPROVAL = new Set(["tour", "applications"]);

export function residentBottomNavPrimarySections(stage: ResidentPortalNavStage): readonly string[] {
  return RESIDENT_BOTTOM_NAV_PRIMARY[stage];
}

export function residentSectionUnlockedForStage(section: string, stage: ResidentPortalNavStage): boolean {
  return STAGE_UNLOCKED_SECTIONS[stage].includes(section);
}

export function residentSectionLockedForStage(section: string, stage: ResidentPortalNavStage): boolean {
  if (stage === "post_approval_pre_lease" || stage === "post_lease") {
    if (LOCKED_AFTER_APPLICATION_APPROVAL.has(section)) return true;
  }
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
    "leaseAccessUnlocked" | "applicationApproved" | "hasSubmittedApplication"
  >,
): boolean {
  const stage = resolveResidentPortalNavStage(access);
  if (pathname === "/resident/profile" || pathname.startsWith("/resident/profile/")) return true;

  if (pathname.startsWith("/resident/applications/apply")) {
    return stage === "pre_approval";
  }

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
  if (LOCKED_AFTER_APPLICATION_APPROVAL.has(section) && stage !== "pre_approval") {
    return "Unavailable after your application is approved";
  }
  if (stage === "pre_approval") {
    return "Available after your application is approved";
  }
  if (stage === "post_approval_pre_lease") {
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
  return "/resident/dashboard";
}
