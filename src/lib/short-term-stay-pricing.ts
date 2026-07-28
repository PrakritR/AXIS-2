import { parseFlexibleLocalDate } from "@/lib/rental-application/lease-dates";
import { parseMoneyAmount } from "@/lib/parse-money";

/** Inclusive night count for a short-term stay (matches generated lease HTML). */
export function shortTermStayNightCount(
  leaseStart: string | undefined | null,
  leaseEnd: string | undefined | null,
): number | null {
  const start = parseFlexibleLocalDate(leaseStart);
  const end = parseFlexibleLocalDate(leaseEnd);
  if (!start || !end) return null;
  const nights = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
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
