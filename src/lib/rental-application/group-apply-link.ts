import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const GROUP_LEADER_APP_ID_PARAM = "groupLeaderAppId";

/** Form patch applied when a roommate opens `/rent/apply?groupLeaderAppId=…`. */
export function groupLeaderInviteFormPatch(
  leaderAppId: string,
): Pick<RentalWizardFormState, "applicantRole" | "applyingAsGroup" | "groupRole" | "groupLeaderAppId"> {
  const id = parseGroupLeaderAppIdParam(leaderAppId);
  return {
    applicantRole: "signer",
    applyingAsGroup: "yes",
    groupRole: "joining",
    groupLeaderAppId: id,
  };
}

/** Public apply URL that pre-fills a joining roommate's group link. */
export function buildGroupApplyPath(leaderAppId: string, opts?: { propertyId?: string }): string {
  const id = parseGroupLeaderAppIdParam(leaderAppId);
  const q = new URLSearchParams({ [GROUP_LEADER_APP_ID_PARAM]: id });
  if (opts?.propertyId?.trim()) q.set("propertyId", opts.propertyId.trim());
  return `/rent/apply?${q.toString()}`;
}

export function buildGroupApplyUrl(origin: string, leaderAppId: string, opts?: { propertyId?: string }): string {
  const path = buildGroupApplyPath(leaderAppId, opts);
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function parseGroupLeaderAppIdParam(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return normalizeApplicationAxisId(raw).toUpperCase();
}
