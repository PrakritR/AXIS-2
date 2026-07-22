import type { GroupRole, RentalWizardFormState } from "./types";

/**
 * Group applications
 * ------------------
 * A "group application" is several *independent* rental applications — each with its
 * own applicant, email, AXIS id, screening, and (once approved) its own resident
 * account and lease — tied together by a shared **Group ID** (`AXISGRP-…`).
 *
 * The first applicant generates the Group ID on submit and shares it; joining
 * applicants paste it in step 1 of the wizard. Nothing here merges the applications
 * into one record: the group is purely a reconciliation view computed by matching
 * `application.groupId` across rows, so each member keeps an independent account
 * while the manager (and the applicants) can see the household as a single bundle.
 *
 * This module is intentionally pure (no DOM / storage / demo imports) so it can be
 * unit-tested and reused from the wizard, the manager applications view, and the
 * resident portal.
 */

export const GROUP_ID_PREFIX = "AXISGRP-";

/**
 * Generate a shareable Group ID for the first applicant of a group application.
 * Format `AXISGRP-XXXXXXXX` (16 chars) — satisfies `validateAxisGroupId`
 * (prefix + length ≥ 12) in `../../app/(public)/rent/apply/apply-validation`.
 */
export function makeApplicationGroupId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
      : `${Date.now().toString(36).toUpperCase()}00000000`.slice(0, 8);
  return `${GROUP_ID_PREFIX}${rand}`;
}

/** Canonical form for matching/storing a Group ID (case-insensitive, trimmed). */
export function normalizeGroupId(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** True when this application form declares group membership with a usable shared id. */
export function applicationHasGroup(app: Partial<RentalWizardFormState> | null | undefined): boolean {
  if (!app) return false;
  return app.applyingAsGroup === "yes" && normalizeGroupId(app.groupId).length > 0;
}

/**
 * Resolve (or mint) the Group ID stored on a form at submit time. The first applicant
 * gets a freshly generated id when they have not been assigned one yet; joining
 * applicants keep the id they pasted. Non-group applications resolve to "".
 */
export function resolveSubmitGroupId(
  form: Pick<RentalWizardFormState, "applyingAsGroup" | "groupRole" | "groupId">,
  mint: () => string = makeApplicationGroupId,
): string {
  if (form.applyingAsGroup !== "yes") return "";
  const existing = form.groupId.trim();
  if (existing) return existing;
  if (form.groupRole === "first") return mint();
  return "";
}

export type ApplicationGroupMemberStatus =
  | "in_progress"
  | "submitted"
  | "screening"
  | "approved"
  | "rejected";

/** One application row reduced to what group reconciliation needs. */
export type GroupRowInput = {
  id: string;
  name: string;
  email: string;
  role: GroupRole;
  /** Raw `application.groupId`. */
  groupId: string;
  /** Raw `application.groupSize` (only the first applicant sets a meaningful value). */
  groupSize: string;
  status: ApplicationGroupMemberStatus;
};

export type ApplicationGroupMember = {
  id: string;
  name: string;
  email: string;
  role: GroupRole;
  status: ApplicationGroupMemberStatus;
};

export type ApplicationGroup = {
  /** Normalized (uppercase) Group ID. */
  groupId: string;
  /** Household size declared by the first applicant, when known. */
  expectedSize: number | null;
  members: ApplicationGroupMember[];
  /** Members that have actually submitted (past `in_progress`). */
  submittedCount: number;
  /** Rows present in the group (submitted or still in progress). */
  totalCount: number;
  /** Expected members still missing (`expectedSize - totalCount`), or null when the size is unknown. */
  missingCount: number | null;
  /** True when at least one member declared themselves the first applicant. */
  hasFirst: boolean;
  /**
   * All expected members are present and none is still in progress. A group can never
   * *block* on completeness — approvals stay per-member — but this drives the "waiting
   * on N" / "all in" copy so a stalled member is visible rather than silently deadlocked.
   */
  isComplete: boolean;
};

function parseGroupSize(raw: string): number | null {
  const n = parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 2 ? n : null;
}

const ROLE_ORDER: Record<Exclude<GroupRole, null> | "none", number> = {
  first: 0,
  joining: 1,
  none: 2,
};

/**
 * Group the given rows by their shared Group ID. Rows without a group id are ignored.
 * Returns a map keyed by the normalized Group ID.
 */
export function buildApplicationGroups(rows: GroupRowInput[]): Map<string, ApplicationGroup> {
  const byId = new Map<string, GroupRowInput[]>();
  for (const row of rows) {
    const gid = normalizeGroupId(row.groupId);
    if (!gid) continue;
    const list = byId.get(gid);
    if (list) list.push(row);
    else byId.set(gid, [row]);
  }

  const groups = new Map<string, ApplicationGroup>();
  for (const [gid, list] of byId) {
    // De-duplicate by application id (a row can appear once); keep first occurrence.
    const seen = new Set<string>();
    const deduped = list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

    const members: ApplicationGroupMember[] = deduped
      .map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status }))
      .sort((a, b) => {
        const ra = ROLE_ORDER[a.role ?? "none"];
        const rb = ROLE_ORDER[b.role ?? "none"];
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    // Expected size is declared by the first applicant; take the largest declared value.
    const expectedSize = deduped.reduce<number | null>((acc, r) => {
      if (r.role !== "first") return acc;
      const size = parseGroupSize(r.groupSize);
      if (size == null) return acc;
      return acc == null ? size : Math.max(acc, size);
    }, null);

    const totalCount = members.length;
    const submittedCount = members.filter((m) => m.status !== "in_progress").length;
    const missingCount = expectedSize == null ? null : Math.max(0, expectedSize - totalCount);
    const hasFirst = members.some((m) => m.role === "first");
    const isComplete =
      expectedSize != null && totalCount >= expectedSize && members.every((m) => m.status !== "in_progress");

    groups.set(gid, {
      groupId: gid,
      expectedSize,
      members,
      submittedCount,
      totalCount,
      missingCount,
      hasFirst,
      isComplete,
    });
  }

  return groups;
}

/** The group a specific row belongs to, or null when the row is not part of a group. */
export function groupForRow(
  groups: Map<string, ApplicationGroup>,
  row: { groupId: string },
): ApplicationGroup | null {
  const gid = normalizeGroupId(row.groupId);
  if (!gid) return null;
  return groups.get(gid) ?? null;
}

/**
 * Short human summary of a group's completion — used by manager rows, the applicant
 * finish screen, and the resident portal. `tone` maps to a Badge tone.
 */
export function summarizeGroupProgress(group: ApplicationGroup): { label: string; tone: "confirmed" | "pending" | "info" } {
  if (group.expectedSize == null) {
    const noun = group.totalCount === 1 ? "applicant" : "applicants";
    return { label: `${group.totalCount} ${noun}`, tone: "info" };
  }
  if (group.isComplete) {
    return { label: `All ${group.expectedSize} applied`, tone: "confirmed" };
  }
  const waiting = group.missingCount ?? Math.max(0, group.expectedSize - group.totalCount);
  const pendingInProgress = group.totalCount - group.submittedCount;
  const remaining = waiting + pendingInProgress;
  const shown = group.submittedCount;
  const suffix = remaining > 0 ? ` · waiting on ${remaining}` : "";
  return { label: `${shown} of ${group.expectedSize} applied${suffix}`, tone: "pending" };
}
