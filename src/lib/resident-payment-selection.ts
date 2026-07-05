import type { HouseholdCharge } from "@/lib/household-charges";
import { canPayHouseholdChargeWithAxisAch } from "@/lib/household-charge-payment-eligibility";

export function chargeBalanceCents(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function unpaidAchChargesForResident(charges: HouseholdCharge[]): HouseholdCharge[] {
  return charges.filter((c) => c.status === "pending" && canPayHouseholdChargeWithAxisAch(c));
}

export function pendingChargesTotalCents(charges: HouseholdCharge[]): number {
  return charges
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + chargeBalanceCents(c.balanceLabel), 0);
}

export function toggleChargeSelection(selectedIds: Set<string>, chargeId: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(chargeId)) next.delete(chargeId);
  else next.add(chargeId);
  return next;
}

export function selectAllUnpaidAchChargeIds(charges: HouseholdCharge[]): Set<string> {
  return new Set(unpaidAchChargesForResident(charges).map((c) => c.id));
}

export function encodeSelectedChargeIds(ids: Iterable<string>): string {
  return [...ids].join(",");
}

export function parseSelectedChargeIds(
  raw: string | null | undefined,
  allowedCharges: HouseholdCharge[],
): Set<string> {
  if (!raw?.trim()) return new Set();
  const allowed = new Set(unpaidAchChargesForResident(allowedCharges).map((c) => c.id));
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && allowed.has(id));
  return new Set(ids);
}

export function residentPaymentsHrefWithSelection(ids: Iterable<string>): string {
  const encoded = encodeSelectedChargeIds(ids);
  return encoded ? `/resident/payments?selected=${encodeURIComponent(encoded)}` : "/resident/payments";
}
