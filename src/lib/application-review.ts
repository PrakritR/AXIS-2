import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  writeManagerApplicationRows,
} from "@/lib/manager-applications-storage";
import {
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  removeAllApplicationCharges,
  removeApprovedApplicationCharges,
} from "@/lib/household-charges";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";

export function stageLabelForApplicationBucket(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Submitted";
}

async function syncResidentApprovalStatus(row: DemoApplicantRow, nextBucket: ManagerApplicationBucket): Promise<Response | null> {
  const email = row.email?.trim().toLowerCase();
  if (!email) return null;
  // /demo never writes real rows — and its sandbox rows are not on the server, so
  // a refusal here would only roll back a walkthrough that is working as intended.
  if (isDemoModeActive()) return null;
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
const UNCONFIRMED_APPROVAL_MESSAGE =
  "This applicant has a withdrawn application on file — refresh to see the current status before approving.";
const UNREACHABLE_APPROVAL_MESSAGE =
  "Couldn't reach the server — approval not saved, retry when connected.";

export type ApplicationBucketTransition = {
  row: DemoApplicantRow;
  welcomeSent: boolean;
  /** Set when the transition did NOT take effect; local state has been rolled back. */
  blocked?: "withdrawn" | "error";
  message?: string;
};

type ResidentApprovalRefusal = {
  error?: unknown;
  blockedApplicationId?: unknown;
  matchedBy?: unknown;
};

async function readApprovalRefusal(res: Response): Promise<ResidentApprovalRefusal> {
  try {
    return (await res.json()) as ResidentApprovalRefusal;
  } catch {
    return {};
  }
}

/**
 * A 409 only proves THIS application is withdrawn when the server matched it by id.
 * Its email fallback can resolve a different application by the same applicant (the
 * approved row's mirror may not have landed yet), and a stamp written from that
 * would be mirrored back and permanently mislabel a record nobody withdrew.
 */
function refusalConfirmsThisApplication(id: string, refusal: ResidentApprovalRefusal): boolean {
  if (refusal.matchedBy !== "id") return false;
  const blockedId = typeof refusal.blockedApplicationId === "string" ? refusal.blockedApplicationId.trim() : "";
  return Boolean(blockedId) && blockedId.toUpperCase() === id.trim().toUpperCase();
}

/**
 * Restore the row's pre-transition bucket after the server refused the approval.
 * A CONFIRMED withdrawn refusal also stamps the local row: the server just told us
 * this record carries the stamp, and without it the row keeps rendering Approve, so
 * the manager can re-fire the whole round trip until the sync TTL catches up.
 */
function rollbackApprovedTransition(
  id: string,
  previous: DemoApplicantRow,
  userId: string | null,
  opts: { stampWithdrawn: boolean },
): void {
  const withdrawnAt = opts.stampWithdrawn
    ? previous.withdrawnAt || new Date().toISOString()
    : previous.withdrawnAt;
  const reverted = readManagerApplicationRows().map((r) =>
    r.id === id
      ? {
          ...r,
          bucket: previous.bucket,
          stage: previous.stage,
          managerUserId: previous.managerUserId,
          withdrawnAt,
        }
      : r,
  );
  writeManagerApplicationRows(reverted);
  try {
    if (previous.bucket === "rejected") {
      removeAllApplicationCharges(id, userId);
    } else {
      removeApprovedApplicationCharges(id, userId);
      recordSubmittedApplicationFeeCharge(previous, userId);
    }
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

  // The server is authoritative for an approval: it owns the withdrawal stamp and
  // it is what actually writes `application_approved`. ANY non-2xx (409 withdrawn,
  // 500 unverifiable, 401/403 session or permission) means the resident was never
  // approved, and neither does a request that never got a response — so an
  // optimistic local "approved" must not survive either.
  //
  // KNOWN LIMITATION (pre-existing, general to every approve — NOT specific to the
  // withdrawn guard, tracked as a separate follow-up): the rollback below is
  // client-side only. `writeManagerApplicationRows` above already fired the
  // fire-and-forget `action: "replace"` mirror with this row as `approved`, and on
  // the server `persistNormalizedRow` provisions the resident account for an
  // approved row. So for a NON-withdrawn refusal the account may already exist even
  // though the local state reverts. The withdrawn case is covered — that mirror is
  // refused by the same guard — but the two writes are otherwise unordered.
  if (nextBucket === "approved") {
    let res: Response | null;
    try {
      res = await syncResidentApprovalStatus(row, nextBucket);
    } catch {
      rollbackApprovedTransition(id, row, opts.userId ?? null, { stampWithdrawn: false });
      return { row, welcomeSent: false, blocked: "error", message: UNREACHABLE_APPROVAL_MESSAGE };
    }
    if (res && !res.ok) {
      const refusal = await readApprovalRefusal(res);
      const serverMessage = typeof refusal.error === "string" && refusal.error.trim() ? refusal.error.trim() : "";
      const confirmedWithdrawn = res.status === 409 && refusalConfirmsThisApplication(id, refusal);
      const unconfirmedWithdrawn = res.status === 409 && !confirmedWithdrawn;
      let message: string;
      if (confirmedWithdrawn) {
        message = serverMessage || WITHDRAWN_APPROVAL_BLOCKED_MESSAGE;
      } else if (unconfirmedWithdrawn) {
        message = UNCONFIRMED_APPROVAL_MESSAGE;
      } else {
        message = serverMessage || "Could not confirm this approval on the server. Nothing was changed.";
      }
      rollbackApprovedTransition(id, row, opts.userId ?? null, { stampWithdrawn: confirmedWithdrawn });
      if (unconfirmedWithdrawn) {
        // The refusal names a record we cannot tie to this row, so nothing local can
        // be stamped from it. Pull authoritative state now instead of waiting out the
        // sync TTL, or the manager's only visible move is to retry the same doomed
        // Approve.
        try {
          await syncManagerApplicationsFromServer({ force: true, managerUserId: opts.userId ?? null });
        } catch {
          /* the rollback already stands; the next scheduled sync will converge */
        }
      }
      return {
        row,
        welcomeSent: false,
        blocked: confirmedWithdrawn ? "withdrawn" : "error",
        message,
      };
    }
  } else {
    try {
      await syncResidentApprovalStatus(row, nextBucket);
    } catch {
      /* keep local workflow moving even if profile sync fails */
    }
  }

  let welcomeSent = false;
  if (nextBucket === "approved" && updatedRow.email?.trim() && !opts.skipWelcomeEmail) {
    const welcome = await requestResidentWelcomeEmail(updatedRow);
    welcomeSent = welcome.status === "sent";
  }

  return { row: updatedRow, welcomeSent };
}
