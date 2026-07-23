import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import { readManagerApplicationRows, writeManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  removeAllApplicationCharges,
  removeApprovedApplicationCharges,
} from "@/lib/household-charges";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";

export function stageLabelForApplicationBucket(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Submitted";
}

async function syncResidentApprovalStatus(row: DemoApplicantRow, nextBucket: ManagerApplicationBucket): Promise<Response | null> {
  const email = row.email?.trim().toLowerCase();
  if (!email) return null;
  // `applicationId` lets the server re-check the exact record's withdrawn stamp so a
  // withdrawn application can never be approved server-side (defense in depth).
  return fetch("/api/portal/resident-approval", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, approved: nextBucket === "approved", applicationId: row.id }),
  });
}

/** POST welcome email; does not open mailto (used for auto-send on approve). */
export async function requestResidentWelcomeEmail(row: DemoApplicantRow): Promise<{
  status: "sent" | "failed" | "no_email";
  mailtoHref?: string;
  error?: string;
}> {
  const email = row.email?.trim();
  if (!email) return { status: "no_email" };
  const res = await fetch("/api/portal/send-resident-welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ to: email, residentName: row.name, axisId: row.id }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; mailtoHref?: string };
  if (res.ok && data.ok) return { status: "sent" };
  return { status: "failed", mailtoHref: typeof data.mailtoHref === "string" ? data.mailtoHref : undefined, error: data.error };
}

export const WITHDRAWN_APPROVAL_BLOCKED_MESSAGE =
  "This application was withdrawn by the applicant and can no longer be approved.";

export type ApplicationBucketTransition = {
  row: DemoApplicantRow;
  welcomeSent: boolean;
  /** Set when the transition did NOT take effect; local state has been rolled back. */
  blocked?: "withdrawn" | "error";
  message?: string;
};

/** Restore the row's pre-transition bucket after the server refused the approval. */
function rollbackApprovedTransition(id: string, previous: DemoApplicantRow, userId: string | null): void {
  const reverted = readManagerApplicationRows().map((r) =>
    r.id === id
      ? { ...r, bucket: previous.bucket, stage: previous.stage, managerUserId: previous.managerUserId }
      : r,
  );
  writeManagerApplicationRows(reverted);
  try {
    removeApprovedApplicationCharges(id, userId);
    recordSubmittedApplicationFeeCharge(previous, userId);
  } catch {
    /* leave charges as-is if reconciliation fails; the bucket is already reverted */
  }
}

/**
 * Shared application bucket transition (pending/approved/rejected): the same status change,
 * charge reconciliation, and resident-approval sync used by the Applications tab, reused by
 * the Residents tab's inline Approve/Deny so both surfaces stay on one code path.
 */
export async function transitionApplicationBucket(
  id: string,
  nextBucket: ManagerApplicationBucket,
  opts: { userId: string | null; skipWelcomeEmail?: boolean },
): Promise<ApplicationBucketTransition | null> {
  const rows = readManagerApplicationRows();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  // Money-path guard: a resident-withdrawn application must never be approved.
  // Approving it would provision a resident account + rent/deposit charges for
  // someone who explicitly pulled out. The manager UI already hides Approve for
  // withdrawn rows; this is the shared-code backstop (the Residents tab reuses
  // this same path), and the server re-checks in /api/portal/resident-approval.
  if (nextBucket === "approved" && isWithdrawnApplicationRow(row)) {
    return { row, welcomeSent: false, blocked: "withdrawn", message: WITHDRAWN_APPROVAL_BLOCKED_MESSAGE };
  }
  const next = rows.map((r) =>
    r.id === id
      ? {
          ...r,
          bucket: nextBucket,
          stage: stageLabelForApplicationBucket(nextBucket),
          managerUserId: r.managerUserId ?? (nextBucket === "approved" ? (opts.userId ?? undefined) : r.managerUserId),
        }
      : r,
  );
  writeManagerApplicationRows(next);
  const updatedRow = next.find((r) => r.id === id) ?? row;

  try {
    if (nextBucket === "approved") {
      recordApprovedApplicationCharges(updatedRow, opts.userId ?? null);
    } else if (nextBucket === "pending") {
      removeApprovedApplicationCharges(id, opts.userId ?? null);
      recordSubmittedApplicationFeeCharge(updatedRow, opts.userId ?? null);
    } else {
      removeAllApplicationCharges(id, opts.userId ?? null);
    }
  } catch {
    /* Keep approval flow moving even if charge reconciliation fails. */
  }

  // The server owns the withdrawal stamp, so its refusal is authoritative: an
  // optimistic local "approved" must never survive a 409 (withdrawn) or a 500
  // (the guard could not verify the record). Other statuses keep the pre-existing
  // behaviour of letting the local workflow continue.
  try {
    const res = await syncResidentApprovalStatus(row, nextBucket);
    if (nextBucket === "approved" && res && (res.status === 409 || res.status === 500)) {
      let message = WITHDRAWN_APPROVAL_BLOCKED_MESSAGE;
      if (res.status === 500) message = "Could not verify this application on the server. Nothing was changed.";
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === "string" && data.error.trim()) message = data.error;
      } catch {
        /* keep the default message */
      }
      rollbackApprovedTransition(id, row, opts.userId ?? null);
      return {
        row,
        welcomeSent: false,
        blocked: res.status === 409 ? "withdrawn" : "error",
        message,
      };
    }
  } catch {
    /* keep local workflow moving even if profile sync fails */
  }

  let welcomeSent = false;
  if (nextBucket === "approved" && updatedRow.email?.trim() && !opts.skipWelcomeEmail) {
    const welcome = await requestResidentWelcomeEmail(updatedRow);
    welcomeSent = welcome.status === "sent";
  }

  return { row: updatedRow, welcomeSent };
}
