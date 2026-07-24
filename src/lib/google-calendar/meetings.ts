import { SLOT_DURATION_MINUTES } from "@/lib/demo-admin-scheduling";
import { toLocalDateStr } from "@/lib/demo-admin-scheduling";
import type { DemoMeeting } from "@/components/portal/portal-calendar-panels";
import type { GoogleCalendarApiEvent } from "@/lib/google-calendar/api.server";

export const GOOGLE_CALENDAR_EVENT_COLOR =
  "bg-slate-500/20 text-slate-900 ring-slate-400/35 [html[data-theme=dark]_&]:bg-slate-400/15 [html[data-theme=dark]_&]:text-slate-100";

export function googleCalendarEventsToMeetings(events: GoogleCalendarApiEvent[]): DemoMeeting[] {
  return events
    .map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const dateStr = toLocalDateStr(start);
      const durationMinutes = Math.max(SLOT_DURATION_MINUTES, Math.round((end.getTime() - start.getTime()) / 60_000));
      const span = Math.max(1, Math.ceil(durationMinutes / SLOT_DURATION_MINUTES));
      return {
        id: `google_${event.id}`,
        source: "external" as const,
        sourceId: event.id,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        dateStr,
        startSlot: Math.max(0, Math.floor((start.getHours() * 60 + start.getMinutes()) / SLOT_DURATION_MINUTES)),
        span,
        durationMinutes,
        title: event.summary,
        color: GOOGLE_CALENDAR_EVENT_COLOR,
        statusLabel: "Google Calendar",
        notes: event.description,
        hostLabel: "Google Calendar",
      } satisfies DemoMeeting;
    })
    .filter(Boolean) as DemoMeeting[];
}
