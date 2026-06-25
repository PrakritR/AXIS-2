/**
 * Pure, server-safe payment helpers shared by the read tool, the write tool, and
 * the confirm endpoint. No database, no SDK, no browser globals — so the
 * security-critical gating logic is unit-testable in isolation.
 *
 * The household-charges module is browser-coupled (sessionStorage, in-memory
 * state); only its pure helpers and types are imported here.
 */
import {
  isHouseholdChargeOverdue,
  chargeDueLabel,
  type HouseholdCharge,
} from "@/lib/household-charges";

/**
 * The authoritative payload for a rent reminder. Every field that reaches an
 * outbound channel (email/SMS/inbox) is derived from a server-fetched charge
 * record, never from model- or client-supplied input.
 */
export type RentReminderPreview = {
  chargeId: string;
  residentName: string;
  residentEmail: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  dueLabel: string;
};

/** Pure: the overdue, unpaid charges from an already-fetched, manager-scoped set. */
export function filterOverdueCharges(
  charges: HouseholdCharge[],
  now: Date = new Date(),
): HouseholdCharge[] {
  return charges.filter((c) => isHouseholdChargeOverdue(c, now));
}

/**
 * Security-critical lookup for the gated send.
 *
 * `managerCharges` MUST be the authenticated manager's own charges (scoped by
 * `manager_user_id` at the database boundary). This returns a charge ONLY when
 * it is both owned by the manager and currently overdue. A `chargeId` belonging
 * to another landlord — or any id not in the manager's overdue set — returns
 * null, so a send can never be addressed to a charge the manager does not own.
 */
export function findOwnedOverdueCharge(
  managerCharges: HouseholdCharge[],
  chargeId: string,
  now: Date = new Date(),
): HouseholdCharge | null {
  const id = String(chargeId ?? "").trim();
  if (!id) return null;
  return filterOverdueCharges(managerCharges, now).find((c) => c.id === id) ?? null;
}

/** Build the authoritative reminder payload from a server-fetched charge record. */
export function buildRentReminderPreview(charge: HouseholdCharge): RentReminderPreview {
  return {
    chargeId: charge.id,
    residentName: charge.residentName?.trim() || "Resident",
    residentEmail: charge.residentEmail.trim().toLowerCase(),
    chargeTitle: charge.title?.trim() || "outstanding charge",
    balanceDue: charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "",
    propertyLabel: charge.propertyLabel?.trim() || "",
    dueLabel: chargeDueLabel(charge),
  };
}
