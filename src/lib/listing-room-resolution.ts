/**
 * The ONE way an application is matched to a room of its listing submission.
 *
 * The charge ledger and the lease document both feed the resolved room to
 * `resolveStayPricing`, so resolving it two different ways puts the same
 * resident on two different rates again — which is the bug the resolver exists
 * to remove. Callers pass primitives (their own room-choice values, an optional
 * unit label, an optional signed rent) and share this fallback chain.
 *
 * Order: room-choice ids → unique signed-rent match → unit-label name match → the only
 * room → the only `daily_rate` room. The signed-rent match is an exact figure and the
 * unit-label match is a fuzzy substring heuristic, so the exact one outranks it.
 *
 * BOTH consumers must pass every field they can resolve, `unitLabel` included. One shared
 * implementation fed two different argument sets still returns two answers.
 */

import {
  isEntireHomeListing,
  type ManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
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

  // An entire-home listing is let as one unit, so its named room IS the premises. This has to
  // live here rather than only on the ledger side: when the two disagreed, an entire-home
  // approval billed the whole-unit rent while its lease quoted whichever room matched first.
  if (sub && isEntireHomeListing(sub)) {
    const named = rooms.find((r) => r.name.trim());
    if (named) return named;
  }

  for (const choice of lookup.roomChoices ?? []) {
    const trimmed = choice?.trim();
    if (!trimmed) continue;
    const { listingRoomId } = parseRoomChoiceValue(trimmed);
    if (!listingRoomId) continue;
    const byId = rooms.find((r) => r.id === listingRoomId);
    if (byId) return byId;
  }

  const signedRent = Number(lookup.signedMonthlyRent ?? 0);
  if (Number.isFinite(signedRent) && signedRent > 0) {
    const byRent = rooms.filter((r) => r.monthlyRent === signedRent);
    if (byRent.length === 1) return byRent[0];
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
