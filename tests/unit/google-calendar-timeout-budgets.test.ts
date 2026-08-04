/**
 * The Google Calendar timeout ladder has to fire before the PLATFORM does.
 *
 * These deadlines exist so a slow Google degrades to an honest partial result —
 * a `calendarSync` notice on cancel/reschedule, no busy time on the public
 * booking page — instead of the request being killed and the client reporting
 * "could not reach the server" for a change that already committed and a guest
 * who was already emailed. A budget above the platform's own function limit is
 * an inert guard: the platform wins and the degraded path never runs.
 *
 * Vercel's default Node function limit is 10s on the smallest plan, and
 * `maxDuration` is a plan-dependent ceiling this repo does not assume, so the
 * whole ladder stays under that.
 */
import { describe, expect, it } from "vitest";
import {
  GOOGLE_CALENDAR_EVENT_LIST_PAGING_BUDGET_MS,
  GOOGLE_CALENDAR_FETCH_TIMEOUT_MS,
  GOOGLE_CALENDAR_OPERATION_TIMEOUT_MS,
  GOOGLE_CALENDAR_WRITE_OPERATION_TIMEOUT_MS,
} from "@/lib/google-calendar/api.server";

/** The smallest default Vercel Node function limit we must finish inside. */
const SMALLEST_PLATFORM_LIMIT_MS = 10_000;

describe("google calendar timeout budgets", () => {
  it("keeps the outer budget under the smallest platform function limit", () => {
    expect(GOOGLE_CALENDAR_OPERATION_TIMEOUT_MS).toBeLessThan(SMALLEST_PLATFORM_LIMIT_MS);
  });

  it("leaves the write path real headroom for the unbounded notification leg", () => {
    // Cancel/reschedule send the guest email and SMS BEFORE the Google call,
    // and those are not bounded here. A write budget that consumed most of the
    // platform limit would let a slow mailer get the request killed — the very
    // outcome the race exists to prevent, reached through a neighbour.
    expect(GOOGLE_CALENDAR_WRITE_OPERATION_TIMEOUT_MS).toBeLessThan(GOOGLE_CALENDAR_OPERATION_TIMEOUT_MS);
    // At least one full round trip left over for whatever ran before it.
    expect(SMALLEST_PLATFORM_LIMIT_MS - GOOGLE_CALENDAR_WRITE_OPERATION_TIMEOUT_MS).toBeGreaterThan(
      GOOGLE_CALENDAR_FETCH_TIMEOUT_MS,
    );
  });

  it("still sizes the write budget above a token hop plus one call", () => {
    // A write never pages, so that chain IS its worst case; anything less would
    // report a timeout for a call still going to succeed.
    expect(GOOGLE_CALENDAR_WRITE_OPERATION_TIMEOUT_MS).toBeGreaterThanOrEqual(
      GOOGLE_CALENDAR_FETCH_TIMEOUT_MS * 2,
    );
  });

  it("orders the ladder: one hop < a paged walk < a whole operation", () => {
    expect(GOOGLE_CALENDAR_FETCH_TIMEOUT_MS).toBeLessThan(GOOGLE_CALENDAR_EVENT_LIST_PAGING_BUDGET_MS);
    expect(GOOGLE_CALENDAR_EVENT_LIST_PAGING_BUDGET_MS).toBeLessThan(GOOGLE_CALENDAR_OPERATION_TIMEOUT_MS);
  });

  it("gives the paging budget room for the token hop plus a first page", () => {
    // The walk always runs its first page after the token refresh, so anything
    // less would make the budget a bound the walk itself cannot honour.
    expect(GOOGLE_CALENDAR_EVENT_LIST_PAGING_BUDGET_MS).toBeGreaterThanOrEqual(
      GOOGLE_CALENDAR_FETCH_TIMEOUT_MS * 2,
    );
  });

  it("sizes the read budget above the paged walk it wraps", () => {
    // A paged read is bounded by the paging budget; the outer race must sit
    // above it, or it reports a timeout for work still going to succeed.
    expect(GOOGLE_CALENDAR_OPERATION_TIMEOUT_MS).toBeGreaterThan(GOOGLE_CALENDAR_EVENT_LIST_PAGING_BUDGET_MS);
  });
});
