/**
 * Per-room rent-pricing helpers — the single source of truth for whether a room
 * is priced monthly (the default, unchanged behavior) or by the day, and for the
 * numbers/labels every surface should show.
 *
 * A room always keeps its `monthlyRent`. It MAY additionally carry a headline
 * daily price (`dailyRentPrice`) and a `rentBasis` flag. `rentBasis` is the single
 * tiebreaker for which rate is active:
 *
 *   - absent / "monthly"  → priced monthly; identical to legacy behavior.
 *   - "daily" (+ dailyRentPrice > 0) → priced by the day; charges bill
 *     billable-days × dailyRentPrice using actual day counts.
 *
 * Daily NEVER wins unless the manager explicitly sets rentBasis = "daily", so
 * every existing monthly-priced room is untouched. This is distinct from the
 * proration-only `dailyRentRate`/`prorateMethod` (which only prorate the partial
 * edge months of a monthly room) and from `shortTermDailyCost` (nightly stays).
 */

/** Minimal shape needed to reason about a room's rent price. */
export type RoomPricingLike = {
  monthlyRent?: number | null;
  rentBasis?: "monthly" | "daily";
  dailyRentPrice?: number | null;
};

/**
 * Days used to convert a daily rate into an approximate MONTHLY figure for
 * sorting, budget filters, and secondary "≈ $X/mo" hints ONLY. Actual charges
 * always use the real number of days in each billed month, never this constant.
 */
export const DAILY_RENT_MONTH_ESTIMATE_DAYS = 30;

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The room's headline daily price, or undefined when it is not daily-priced. */
export function roomDailyRentPrice(room: RoomPricingLike | null | undefined): number | undefined {
  if (!room || room.rentBasis !== "daily") return undefined;
  return positiveNumber(room.dailyRentPrice);
}

/** True only when the manager explicitly priced this room by the day. */
export function roomIsDailyPriced(room: RoomPricingLike | null | undefined): boolean {
  return roomDailyRentPrice(room) !== undefined;
}

/** "day" for a daily-priced room, otherwise "month" (the default). */
export function roomPricePeriod(room: RoomPricingLike | null | undefined): "day" | "month" {
  return roomIsDailyPriced(room) ? "day" : "month";
}

/** Short period suffix, e.g. "/day" or "/mo". */
export function roomPricePeriodSuffix(room: RoomPricingLike | null | undefined): "/day" | "/mo" {
  return roomIsDailyPriced(room) ? "/day" : "/mo";
}

/**
 * A single comparable monthly-equivalent number for sorting and budget filters:
 * daily rooms use dailyRentPrice × {@link DAILY_RENT_MONTH_ESTIMATE_DAYS}; monthly
 * rooms use monthlyRent. Returns 0 when nothing is priced.
 */
export function roomMonthlyEquivalent(room: RoomPricingLike | null | undefined): number {
  const daily = roomDailyRentPrice(room);
  if (daily !== undefined) return Number((daily * DAILY_RENT_MONTH_ESTIMATE_DAYS).toFixed(2));
  const monthly = positiveNumber(room?.monthlyRent);
  return monthly ?? 0;
}

/**
 * The headline numeric a card/detail should display (the daily price for daily
 * rooms, the monthly rent otherwise), or null when nothing is priced.
 */
export function roomHeadlineAmount(room: RoomPricingLike | null | undefined): number | null {
  const daily = roomDailyRentPrice(room);
  if (daily !== undefined) return daily;
  const monthly = positiveNumber(room?.monthlyRent);
  return monthly ?? null;
}

/**
 * Formats a headline rent amount: whole dollars stay bare ("$1,200"), fractional
 * amounts always show cents ("$39.50") so a $39.50/day room never renders "$39.5".
 */
export function formatRoomPriceAmount(amount: number): string {
  return Number.isInteger(amount) ? `$${amount.toLocaleString("en-US")}` : `$${amount.toFixed(2)}`;
}

const formatUsd = formatRoomPriceAmount;

/**
 * The room's headline price label, e.g. "$40/day" or "$825/mo". Returns
 * `fallback` when nothing is priced.
 */
export function roomHeadlinePriceLabel(
  room: RoomPricingLike | null | undefined,
  fallback = "—",
): string {
  const amount = roomHeadlineAmount(room);
  if (amount === null) return fallback;
  return `${formatUsd(amount)}${roomPricePeriodSuffix(room)}`;
}
