import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  upsertApplicationRowToServer,
  wouldDowngradeSubmittedApplication,
} from "@/lib/manager-applications-storage";
import { getPropertyById, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const IN_PROGRESS_APPLICATION_STAGE = "In progress";

/** User-facing label for draft applications (stored stage remains `In progress`). */
export const INCOMPLETE_APPLICATION_LABEL = "Incomplete";

export function isInProgressApplicationRow(row: DemoApplicantRow): boolean {
  return row.bucket === "pending" && row.stage.trim().toLowerCase() === IN_PROGRESS_APPLICATION_STAGE.toLowerCase();
}

/**
 * A resident may hold several in-progress applications at once — different
 * properties, or different rooms in the same property. This identifies WHICH
 * one (if any) a fresh apply request is really asking to resume: same
 * property, and (when either side names one) the same room or bundle.
 * Nothing broader — a different property, or an explicitly different room in
 * the same property, must always start a new application, never hijack this one.
 */
export type ApplicationRequestTarget = {
  propertyId: string;
  listingRoomId?: string;
  bundleId?: string;
};

type ApplicationSnapshot = {
  propertyId?: string | null;
  application?: Partial<Pick<RentalWizardFormState, "propertyId" | "roomChoice1" | "bundleId">> | null;
};

/**
 * True when `candidate` (an existing in-progress application, or a locally
 * loaded draft) IS the application `target` is asking for. Matching is
 * intentionally asymmetric: a request that names no room/bundle at all is
 * compatible with any draft for that property (so re-clicking "Apply" on a
 * listing without picking a room keeps resuming the same draft instead of
 * spawning a new one every time); a request that DOES name a specific room
 * or bundle only matches a candidate with that exact room/bundle (or one that
 * hasn't committed to one yet) — never a candidate committed to a different one.
 */
export function targetMatchesApplication(target: ApplicationRequestTarget, candidate: ApplicationSnapshot): boolean {
  const targetPid = target.propertyId.trim();
  if (!targetPid) return false;
  const candidatePid = candidate.propertyId?.trim() || candidate.application?.propertyId?.trim() || "";
  if (candidatePid !== targetPid) return false;

  const targetBundle = target.bundleId?.trim();
  const candidateBundle = candidate.application?.bundleId?.trim() || "";
  if (targetBundle) return targetBundle === candidateBundle;
  if (candidateBundle) return false; // request wants a per-room/plain application; this candidate is a bundle application.

  const targetRoom = target.listingRoomId?.trim();
  if (!targetRoom) return true; // no room named — any draft for this property matches.
  const candidateRoomChoice = candidate.application?.roomChoice1?.trim() || "";
  const candidateRoom = candidateRoomChoice ? parseRoomChoiceValue(candidateRoomChoice).listingRoomId : undefined;
  if (!candidateRoom) return true; // candidate hasn't committed to a room either — compatible.
  return candidateRoom === targetRoom;
}

/**
 * Finds the resident's in-progress row (if any) that matches an apply target.
 * `target === null` means the request named no property at all (a bare, legacy
 * `/apply` entry) — the only case where falling back to "any in-progress row"
 * is still correct, because there is nothing more specific to match against.
 */
export function findInProgressRowForTarget(
  rows: DemoApplicantRow[],
  target: ApplicationRequestTarget | null,
): DemoApplicantRow | undefined {
  const inProgress = rows.filter(isInProgressApplicationRow);
  if (!target?.propertyId.trim()) return inProgress[0];
  return inProgress.find((row) => targetMatchesApplication(target, row));
}

/** Display label for application stage everywhere in the product UI, PDFs, and assistant tools. */
export function applicationStageDisplayLabel(row: Pick<DemoApplicantRow, "bucket" | "stage">): string {
  if (isInProgressApplicationRow(row as DemoApplicantRow)) return INCOMPLETE_APPLICATION_LABEL;
  const stage = row.stage?.trim();
  if (stage) return stage;
  if (row.bucket === "approved") return "Approved";
  if (row.bucket === "rejected") return "Rejected";
  return "Pending review";
}

/**
 * Submitted applications awaiting manager review (pending bucket, not a draft).
 * A resident-withdrawn application keeps `bucket === "pending"` but is NOT
 * awaiting review — the resident pulled out — so it is excluded here to keep it
 * off the manager's actionable "needs attention" surfaces (nav badge, dashboard).
 * It stays visible in the Applications tab, labelled Withdrawn.
 */
export function isSubmittedPendingApplicationRow(row: DemoApplicantRow): boolean {
  return row.bucket === "pending" && !isInProgressApplicationRow(row) && !isWithdrawnApplicationRow(row);
}

export function inProgressApplicationResumeUrl(origin: string, row: DemoApplicantRow): string {
  const base = origin.replace(/\/$/, "");
  const pid = row.propertyId?.trim() || row.application?.propertyId?.trim();
  const path = pid ? `/rent/apply?propertyId=${encodeURIComponent(pid)}` : "/rent/apply";
  return `${base}${path}`;
}

/** True when a draft snapshot should sync to the server (portal or public guest apply). */
export function shouldSyncInProgressDraft(input: {
  email: string;
  propertyId: string;
}): boolean {
  return input.email.trim().includes("@") && Boolean(input.propertyId.trim());
}

export function buildInProgressApplicationRow(input: {
  axisId: string;
  form: RentalWizardFormState;
  residentEmail: string;
}): DemoApplicantRow {
  const pid = input.form.propertyId.trim();
  const prop = pid ? getPropertyById(pid) : undefined;
  const email = input.residentEmail.trim();
  const name = input.form.fullLegalName.trim() || "Applicant";

  return {
    id: input.axisId,
    name,
    property: (prop?.title?.trim() || pid) || "Listing",
    propertyId: pid || undefined,
    managerUserId: prop?.managerUserId ?? null,
    stage: IN_PROGRESS_APPLICATION_STAGE,
    bucket: "pending",
    backgroundCheckStatus: "pending_review",
    detail: `Started ${new Date().toLocaleString()}`,
    email,
    application: structuredClone(input.form),
  };
}

const submitInitiatedAxisIds = new Set<string>();

/**
 * Marks an axis id as having entered submit, so the wizard's per-keystroke draft
 * effect stops issuing draft writes for it. This is only a cheap second layer —
 * the authoritative defense is the conditional write in the API route, which no
 * caller can bypass.
 */
export function markApplicationSubmitInitiated(axisId: string): void {
  const id = axisId.trim();
  if (id) submitInitiatedAxisIds.add(id);
}

export function syncInProgressApplicationRow(input: {
  axisId: string;
  form: RentalWizardFormState;
  residentEmail: string;
}): void {
  const row = buildInProgressApplicationRow(input);
  if (submitInitiatedAxisIds.has(row.id.trim())) return;
  // Never walk a submitted application back to a draft. The server enforces this
  // too (a draft POST can still be in flight when submit lands); this keeps the
  // local cache honest and avoids issuing the doomed write at all.
  const existing = readManagerApplicationRows().find((cached) => cached.id === row.id);
  if (wouldDowngradeSubmittedApplication(existing, row)) return;

  replaceManagerApplicationRowInCache(row);
  upsertApplicationRowToServer(row);
}
