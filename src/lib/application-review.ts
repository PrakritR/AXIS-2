import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import { readManagerApplicationRows, writeManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  removeAllApplicationCharges,
  removeApprovedApplicationCharges,
} from "@/lib/household-charges";

export function stageLabelForApplicationBucket(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Submitted";
}

async function syncResidentApprovalStatus(row: DemoApplicantRow, nextBucket: ManagerApplicationBucket): Promise<void> {
  const email = row.email?.trim().toLowerCase();
  if (!email) return;
  await fetch("/api/portal/resident-approval", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, approved: nextBucket === "approved" }),
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

/**
 * Shared application bucket transition (pending/approved/rejected): the same status change,
 * charge reconciliation, and resident-approval sync used by the Applications tab, reused by
 * the Residents tab's inline Approve/Deny so both surfaces stay on one code path.
 */
export async function transitionApplicationBucket(
  id: string,
  nextBucket: ManagerApplicationBucket,
  opts: { userId: string | null; skipWelcomeEmail?: boolean },
): Promise<{ row: DemoApplicantRow; welcomeSent: boolean } | null> {
  const rows = readManagerApplicationRows();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
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

  try {
    await syncResidentApprovalStatus(row, nextBucket);
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
