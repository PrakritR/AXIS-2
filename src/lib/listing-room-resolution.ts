/**
 * The ONE way an application is matched to a room of its listing submission.
 *
 * The charge ledger and the lease document both feed the resolved room to
 * `resolveStayPricing`, so resolving it two different ways puts the same
 * resident on two different rates again — which is the bug the resolver exists
 * to remove. Callers pass primitives (their own room-choice values, an optional
 * unit label, an optional signed rent) and share this fallback chain.
 *
 * Order is the ledger's original precedence, with the document's unit-label match
 * inserted after the id lookups. The ledger passes no `unitLabel`, so that step is
 * inert for it and its behavior is unchanged.
 */

import type { ManagerListingSubmissionV1, ManagerRoomSubmission } from "@/lib/manager-listing-submission";
import { parseRoomChoiceValue } from "@/lib/rental-application/data";
import { roomDailyRentPrice } from "@/lib/room-pricing";

export type SubmissionRoomLookup = {
  /** Room-choice values in priority order (e.g. assignedRoomChoice, then roomChoice1). */
  roomChoices?: readonly (string | null | undefined)[];
  /** Property unit label, matched against room names when no room-choice id resolves. */
  unitLabel?: string | null;
  /** This resident's signed monthly rent, used only for a UNIQUE monthly-rent match. */
  signedMonthlyRent?: number | null;
};

/** Callers pass an ALREADY-NORMALIZED submission (`normalizeManagerListingSubmissionV1`). */
export function resolveSubmissionRoom(
  sub: ManagerListingSubmissionV1 | null | undefined,
  lookup: SubmissionRoomLookup,
): ManagerRoomSubmission | undefined {
  const rooms = sub?.rooms;
  if (!rooms?.length) return undefined;

  for (const choice of lookup.roomChoices ?? []) {
    const trimmed = choice?.trim();
    if (!trimmed) continue;
    const { listingRoomId } = parseRoomChoiceValue(trimmed);
    if (!listingRoomId) continue;
    const byId = rooms.find((r) => r.id === listingRoomId);
    if (byId) return byId;
  }

  const label = lookup.unitLabel?.trim().toLowerCase();
  if (label) {
    const named = rooms.filter((r) => r.name.trim());
    const exact = named.find((r) => r.name.trim().toLowerCase() === label);
    if (exact) return exact;
    const partial = named.find((r) => {
      const name = r.name.trim().toLowerCase();
      return name.includes(label) || label.includes(name);
    });
    if (partial) return partial;
  }

  const signedRent = Number(lookup.signedMonthlyRent ?? 0);
  if (Number.isFinite(signedRent) && signedRent > 0) {
    const byRent = rooms.filter((r) => r.monthlyRent === signedRent);
    if (byRent.length === 1) return byRent[0];
  }
  if (rooms.length === 1) return rooms[0];
  // Last resort: only one room is configured with daily_rate → it must be the right room.
  const dailyRateRooms = rooms.filter(
    (r) => r.prorateMethod === "daily_rate" && r.dailyRentRate && r.dailyRentRate > 0,
  );
  if (dailyRateRooms.length === 1) return dailyRateRooms[0];
  return undefined;
}

/**
 * Period-aware rent line for one room: `"$55.00 / day"` for a daily-priced room,
 * `"$1200.00 / month"` otherwise, `undefined` when nothing is priced.
 */
export function submissionRoomRentLabel(room: ManagerRoomSubmission | null | undefined): string | undefined {
  if (!room) return undefined;
  const daily = roomDailyRentPrice(room);
  if (daily !== undefined) return `$${daily.toFixed(2)} / day`;
  if (room.monthlyRent > 0) return `$${room.monthlyRent.toFixed(2)} / month`;
  return undefined;
}
