import type { DemoApplicantRow } from "@/data/demo-portal";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import {
  householdChargeManagerBucket,
  isManagerAddedOneOffCharge,
  readChargesForManager,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { collectLinkedPropertyIdsForModule } from "@/lib/manager-portfolio-access";

/**
 * WHY THIS MODULE EXISTS
 *
 * `/portal/payments` and the dashboard "Payments" group are the same money,
 * read from the same store — and they used to compute it two different ways.
 * Payments narrowed `readChargesForManager` by two extra rules (below) that the
 * dashboard never applied, so the dashboard advertised "View all 85 →" against
 * a page that listed 64, and "80 pending" against a Pending tab reading 58.
 *
 * A manager acts on those numbers. The scoping now lives here once, and BOTH
 * surfaces call it, so the two can no longer drift apart.
 * Coverage: `tests/unit/manager-payments-dashboard-agreement.test.ts`.
 */

/** Internal accounts that must never appear as a payer on the manager ledger. */
export const PAYMENT_ACCOUNT_EXCLUSIONS = ["sharad ramachandran", "sharad"] as const;

export function shouldExcludePaymentAccount(residentName: string, residentEmail?: string): boolean {
  const name = (residentName ?? "").trim().toLowerCase();
  const email = (residentEmail ?? "").trim().toLowerCase();
  return PAYMENT_ACCOUNT_EXCLUSIONS.some((token) => name.includes(token) || email.includes(token));
}

/**
 * The Payments ledger view of a manager's charges: everything
 * `readChargesForManager` returns, minus
 *  1. internal/system payer accounts, and
 *  2. charges belonging to someone who is no longer a current resident — except
 *     a manager "Add payment" one-off, which stays visible after the payer moves
 *     to Previous because the manager entered it deliberately.
 */
export function scopeChargesToManagerPaymentsLedger(
  charges: HouseholdCharge[],
  applications: DemoApplicantRow[],
): HouseholdCharge[] {
  const previousResidentEmails = new Set(
    applications
      .filter((row) => !isCurrentResidentApplicationRow(row))
      .map((row) => row.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  );
  return charges
    .filter((charge) => !shouldExcludePaymentAccount(charge.residentName, charge.residentEmail))
    .filter((charge) => {
      if (isManagerAddedOneOffCharge(charge)) return true;
      const email = charge.residentEmail?.trim().toLowerCase();
      return !email || !previousResidentEmails.has(email);
    });
}

/** Browser-only convenience: read + scope in one call (what both surfaces use). */
export function readManagerPaymentsLedgerCharges(managerUserId: string | null): HouseholdCharge[] {
  const charges = readChargesForManager(managerUserId, {
    linkedPropertyIds: collectLinkedPropertyIdsForModule(managerUserId ?? "", "payments"),
  });
  return scopeChargesToManagerPaymentsLedger(charges, readManagerApplicationRows());
}

export type ManagerPaymentBucketCounts = { pending: number; overdue: number; paid: number };

/** Pending / Overdue / Paid counts — the same split the Payments tabs render. */
export function managerPaymentBucketCounts(charges: HouseholdCharge[]): ManagerPaymentBucketCounts {
  const counts: ManagerPaymentBucketCounts = { pending: 0, overdue: 0, paid: 0 };
  for (const charge of charges) counts[householdChargeManagerBucket(charge)] += 1;
  return counts;
}

/** Charges the manager still has to collect (Pending + Overdue), never Paid. */
export function unpaidManagerPaymentCharges(charges: HouseholdCharge[]): HouseholdCharge[] {
  return charges.filter((charge) => householdChargeManagerBucket(charge) !== "paid");
}
