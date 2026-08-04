"use client";

import { useEffect, useState } from "react";
import type { DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { startOfWeekMonday } from "@/lib/demo-admin-scheduling";

export type GoogleCalendarBusyWarning = {
  warning?: string;
  hint?: string;
  /** The window held more events than the server would page through. */
  truncated?: boolean;
};

/** Warning code the events route returns when it could not load the whole window. */
export const GOOGLE_BUSY_TRUNCATED_WARNING = "calendar_events_truncated";

/**
 * The manager's linked Google Calendar busy time, as calendar meetings.
 *
 * Lives in a hook because BOTH manager calendars need it. The portfolio
 * calendar fetched it inline and the per-property availability calendar never
 * fetched it at all, so a slot the portfolio view showed as "Blocked" was a
 * free, selectable window on the very screen where the manager publishes tour
 * availability — the one place a conflict must be visible (manager audit
 * F-CAL-6, a double-booking risk).
 *
 * Best-effort by design: not connected, API disabled, or a transient failure
 * all resolve to an empty list, and the caller decides whether to surface the
 * warning (only the portfolio calendar toasts, so a manager never gets the same
 * toast twice).
 *
 * ## The window is BOUNDED — conflicts outside it are NOT shown
 *
 * One request covers a fixed window around today ({@link GOOGLE_BUSY_DAYS_BEFORE}
 * back through `daysAhead` forward), not whichever week the calendar is
 * showing. A manager who navigates past the end of it sees zero busy cells and
 * can publish tour availability straight on top of a Google meeting. That is a
 * narrower guarantee than either calendar implies, so the window is wide rather
 * than week-sized: one larger request is cheaper than refetching on every week
 * navigation, and every extra day is a conflict that becomes visible on BOTH
 * calendars.
 *
 * ## A TRUNCATED response means conflicts may be missing
 *
 * The server pages through the window but gives up after a bounded number of
 * pages, and Google returns events in start-time order — so anything dropped is
 * dropped from the FAR end of the range, which is the part the wide window
 * exists to cover. When that happens the response carries
 * {@link GOOGLE_BUSY_TRUNCATED_WARNING} and `truncated: true`, delivered through
 * `onWarning`. The meetings returned are still real, but they are not all of
 * them: a caller that lets a manager publish availability must say so rather
 * than present the grid as conflict-free.
 */

/** Trailing days included so today's week is complete, not clipped at "now". */
export const GOOGLE_BUSY_DAYS_BEFORE = 7;

/** Forward span of the busy window. Beyond this, conflicts are not shown. */
export const GOOGLE_BUSY_DEFAULT_DAYS_AHEAD = 56;

export function useGoogleCalendarBusyMeetings(input: {
  enabled: boolean;
  /** Bump to refetch (a reconnect, a manual refresh). */
  refreshSignal?: number;
  daysAhead?: number;
  onWarning?: (warning: GoogleCalendarBusyWarning) => void;
}): DemoMeeting[] {
  const { enabled, refreshSignal, daysAhead = GOOGLE_BUSY_DEFAULT_DAYS_AHEAD, onWarning } = input;
  const [meetings, setMeetings] = useState<DemoMeeting[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMeetings([]);
      return;
    }
    let cancelled = false;
    const weekStart = startOfWeekMonday(new Date());
    weekStart.setDate(weekStart.getDate() - GOOGLE_BUSY_DAYS_BEFORE);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + GOOGLE_BUSY_DAYS_BEFORE + daysAhead);
    void fetch(
      `/api/portal/google-calendar/events?timeMin=${encodeURIComponent(
        weekStart.toISOString(),
      )}&timeMax=${encodeURIComponent(weekEnd.toISOString())}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        const data = (await res.json()) as { meetings?: DemoMeeting[] } & GoogleCalendarBusyWarning;
        if (!res.ok) return { meetings: [] as DemoMeeting[] };
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setMeetings(Array.isArray(data.meetings) ? data.meetings : []);
        if (data.warning) {
          onWarning?.({ warning: data.warning, hint: data.hint, truncated: data.truncated });
        }
      })
      .catch(() => {
        if (!cancelled) setMeetings([]);
      });
    return () => {
      cancelled = true;
    };
    // `onWarning` is intentionally excluded: callers pass an inline closure, and
    // depending on it would refetch Google on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshSignal, daysAhead]);

  return meetings;
}
