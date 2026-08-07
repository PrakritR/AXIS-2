import type { DemoApplicantRow } from "@/data/demo-portal";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { normalizeGroupId } from "@/lib/rental-application/application-groups";

export type GroupLeaderLinkOk = {
  ok: true;
  leaderAppId: string;
  groupId: string;
  groupSize: number | null;
  organizerFirstName: string | null;
};

export type GroupLeaderLinkErrorCode =
  | "invalid_id"
  | "not_found"
  | "not_group_organizer"
  | "missing_group_link";

export type GroupLeaderLinkError = {
  ok: false;
  code: GroupLeaderLinkErrorCode;
  message: string;
};

export type GroupLeaderLinkPreview = GroupLeaderLinkOk | GroupLeaderLinkError;

export function validateGroupLeaderAppIdInput(
  id: string,
): { ok: true; normalized: string } | { ok: false; message: string } {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter the first applicant's application ID or open their invite link." };
  }
  const normalized = normalizeApplicationAxisId(trimmed).toUpperCase();
  const suffix = normalized.replace(/^(AXIS|PROPLANE)-/, "");
  if (!suffix || suffix.length < 4) {
    return { ok: false, message: "Application ID looks too short." };
  }
  return { ok: true, normalized };
}

/**
 * Quality gate for a group invite link or a manually typed organizer application id.
 * Confirms the leader exists, declared a group, and already has a linkable group id.
 */
export function assessGroupLeaderApplication(
  leaderAppId: string,
  row: Pick<DemoApplicantRow, "id" | "application" | "name"> | null | undefined,
): GroupLeaderLinkPreview {
  const validated = validateGroupLeaderAppIdInput(leaderAppId);
  if (!validated.ok) {
    return { ok: false, code: "invalid_id", message: validated.message };
  }

  if (!row) {
    return {
      ok: false,
      code: "not_found",
      message: "No application found with that ID. Check the link or ask your roommate to resend it.",
    };
  }

  const app = row.application;
  if (!app || app.applyingAsGroup !== "yes" || app.groupRole !== "first") {
    return {
      ok: false,
      code: "not_group_organizer",
      message:
        "That application is not set up as a group organizer. Ask for the invite link from whoever applied first.",
    };
  }

  const groupId = normalizeGroupId(app.groupId);
  if (!groupId) {
    return {
      ok: false,
      code: "missing_group_link",
      message:
        "That organizer has not finished group setup yet. Ask them to choose how many people are applying on step 1, then resend the link.",
    };
  }

  const sizeRaw = parseInt((app.groupSize ?? "").trim(), 10);
  const groupSize = Number.isFinite(sizeRaw) && sizeRaw >= 2 ? sizeRaw : null;
  const name = (row.name || app.fullLegalName || "").trim();
  const organizerFirstName = name.split(/\s+/).filter(Boolean)[0] ?? null;

  return {
    ok: true,
    leaderAppId: validated.normalized,
    groupId,
    groupSize,
    organizerFirstName,
  };
}
