import type { DemoApplicantRow } from "@/data/demo-portal";
import { recordApprovedApplicationCharges } from "@/lib/household-charges";
import { regenerateEditableLeasesForResident } from "@/lib/lease-pipeline-storage";
import {
  readManagerApplicationRows,
  upsertApplicationRowToServer,
  writeManagerApplicationRows,
} from "@/lib/manager-applications-storage";
import { shortTermCheckoutDate } from "@/lib/short-term-stay-pricing";

/** After a short-term stay-total payment edit, align application dates, charges, and editable leases. */
export function syncResidentAfterStayPaymentEdit(input: {
  residentEmail: string;
  managerUserId: string | null;
  nights: number;
  nightlyRate?: number;
}): number {
  const email = input.residentEmail.trim().toLowerCase();
  if (!email || !(input.nights > 0)) return 0;

  const rows = readManagerApplicationRows();
  const idx = rows.findIndex((r) => r.email?.trim().toLowerCase() === email);
  if (idx === -1) return 0;

  const existing = rows[idx]!;
  if (existing.application?.rentalType !== "short_term") return 0;

  const leaseStart =
    existing.application.leaseStart?.trim() || existing.manualResidentDetails?.moveInDate?.trim() || "";
  if (!leaseStart) return 0;

  const leaseEnd = shortTermCheckoutDate(leaseStart, input.nights);
  if (!leaseEnd) return 0;

  const nightly =
    input.nightlyRate && input.nightlyRate > 0
      ? input.nightlyRate
      : Number(existing.signedMonthlyRent ?? 0) > 0
        ? Number(existing.signedMonthlyRent)
        : undefined;

  const nextRow: DemoApplicantRow = {
    ...existing,
    signedMonthlyRent: nightly ?? existing.signedMonthlyRent,
    manualResidentDetails: {
      ...(existing.manualResidentDetails ?? {}),
      moveInDate: leaseStart,
      moveOutDate: leaseEnd,
    },
    application: existing.application
      ? {
          ...existing.application,
          leaseStart,
          leaseEnd,
          managerRentOverride: nightly != null ? String(nightly) : existing.application.managerRentOverride,
        }
      : existing.application,
  };

  const next = [...rows];
  next[idx] = nextRow;
  writeManagerApplicationRows(next);
  upsertApplicationRowToServer(nextRow);
  recordApprovedApplicationCharges(nextRow, input.managerUserId, true);
  return regenerateEditableLeasesForResident(email, input.managerUserId, nextRow.application);
}

/** Refresh pending charges and regenerate editable leases after application or payment edits. */
export function syncResidentBillingAndLeases(input: {
  residentEmail: string;
  managerUserId: string | null;
}): number {
  const email = input.residentEmail.trim().toLowerCase();
  if (!email) return 0;

  const row = readManagerApplicationRows().find((r) => r.email?.trim().toLowerCase() === email);
  if (!row) return 0;

  recordApprovedApplicationCharges(row, input.managerUserId, true);
  return regenerateEditableLeasesForResident(email, input.managerUserId, row.application);
}
