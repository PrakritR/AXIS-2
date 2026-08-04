"use client";

import { useEffect, useState } from "react";
import type { DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { startOfWeekMonday } from "@/lib/demo-admin-scheduling";

export type GoogleCalendarBusyWarning = { warning?: string; hint?: string };

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
 */
export function useGoogleCalendarBusyMeetings(input: {
  enabled: boolean;
  /** Bump to refetch (a reconnect, a manual refresh). */
  refreshSignal?: number;
  daysAhead?: number;
  onWarning?: (warning: GoogleCalendarBusyWarning) => void;
}): DemoMeeting[] {
  const { enabled, refreshSignal, daysAhead = 14, onWarning } = input;
  const [meetings, setMeetings] = useState<DemoMeeting[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMeetings([]);
      return;
    }
    let cancelled = false;
    const weekStart = startOfWeekMonday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + daysAhead);
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
        if (data.warning) onWarning?.({ warning: data.warning, hint: data.hint });
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
