import { formatIsoDateInput, parseFlexibleLocalDate } from "@/lib/rental-application/lease-dates";
import { parseMoneyAmount } from "@/lib/parse-money";

/** Checkout-exclusive night count (check-out morning is not billed). */
/** Check-out date for a stay that bills `nights` checkout-exclusive nights from check-in. */
export function shortTermCheckoutDate(leaseStart: string | undefined | null, nights: number): string | null {
  const start = parseFlexibleLocalDate(leaseStart);
  if (!start || !(nights > 0)) return null;
  const checkout = new Date(start.getFullYear(), start.getMonth(), start.getDate() + nights);
  return formatIsoDateInput(checkout);
}

export function shortTermStayNightCount(
  leaseStart: string | undefined | null,
  leaseEnd: string | undefined | null,
): number | null {
  const start = parseFlexibleLocalDate(leaseStart);
  const end = parseFlexibleLocalDate(leaseEnd);
  if (!start || !end) return null;
  const nights = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return Number.isFinite(nights) && nights > 0 ? nights : null;
}

export function shortTermNightlyRate(raw: string | undefined | null): number {
  const amount = parseMoneyAmount(String(raw ?? "").trim());
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function shortTermStayTotalAmount(nightlyRate: number, nights: number): number {
  if (!(nightlyRate > 0) || !(nights > 0)) return 0;
  return Number((nightlyRate * nights).toFixed(2));
}

export function shortTermStayChargeTitle(nights: number, nightlyRate: number): string {
  const rateLabel = nightlyRate % 1 === 0 ? `$${nightlyRate}` : `$${nightlyRate.toFixed(2)}`;
  const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
  return `Stay total (${nightLabel} × ${rateLabel})`;
}

/** Inverse of {@link shortTermStayChargeTitle} for manager payment edits. */
export function parseShortTermStayChargeTitle(title: string): { nights: number; nightlyRate: number } | null {
  const match = title.trim().match(/^Stay total \((\d+) nights? × (\$[\d.]+)\)$/i);
  if (!match) return null;
  const nights = Number(match[1]);
  const nightlyRate = parseMoneyAmount(match[2] ?? "");
  if (!(nights > 0) || !(nightlyRate > 0)) return null;
  return { nights, nightlyRate };
}
