import type { SupabaseClient } from "@supabase/supabase-js";

import { createGoogleCalendarEvent } from "@/lib/google-calendar/api.server";
import { loadGoogleCalendarConnection } from "@/lib/google-calendar/settings";

/** Best-effort push of a confirmed PropLane tour onto the manager's Google Calendar. */
export async function syncPlannedTourToGoogleCalendar(
  db: SupabaseClient,
  managerUserId: string,
  event: {
    title: string;
    start: string;
    end: string;
    propertyTitle?: string;
    attendeeName?: string;
    attendeeEmail?: string;
    attendeePhone?: string;
    notes?: string;
    instructions?: string;
  },
): Promise<void> {
  const connection = await loadGoogleCalendarConnection(db, managerUserId);
  if (!connection.connected || !connection.syncEnabled) return;

  const descriptionParts = [
    event.attendeeName ? `Guest: ${event.attendeeName}` : null,
    event.attendeeEmail ? `Email: ${event.attendeeEmail}` : null,
    event.attendeePhone ? `Phone: ${event.attendeePhone}` : null,
    event.notes ? `Notes: ${event.notes}` : null,
    event.instructions ? `Instructions: ${event.instructions}` : null,
    "Created from PropLane",
  ].filter(Boolean);

  await createGoogleCalendarEvent(db, managerUserId, {
    title: event.title,
    description: descriptionParts.join("\n"),
    start: event.start,
    end: event.end,
    location: event.propertyTitle,
  });
}
