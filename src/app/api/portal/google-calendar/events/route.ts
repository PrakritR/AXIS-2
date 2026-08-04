import { NextResponse } from "next/server";

import { classifyGoogleCalendarEventsFetchError, listGoogleCalendarEventsPaged } from "@/lib/google-calendar/api.server";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";
import { googleCalendarEventsToMeetings } from "@/lib/google-calendar/meetings";
import { deleteProplaneGoogleCalendarEvent } from "@/lib/google-calendar/sync.server";
import { loadGoogleCalendarConnection } from "@/lib/google-calendar/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireManager() {
  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user?.id) return null;

  const db = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);
  const roleList = (roles ?? []).map((r) => String(r.role).toLowerCase());
  const legacy = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const isManager = roleList.includes("manager") || legacy === "manager" || legacy === "admin";
  if (!isManager) return null;
  return { db, userId: user.id };
}

export async function GET(req: Request) {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const url = new URL(req.url);
    const timeMin = url.searchParams.get("timeMin");
    const timeMax = url.searchParams.get("timeMax");
    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin and timeMax are required." }, { status: 400 });
    }
    const connection = await loadGoogleCalendarConnection(ctx.db, ctx.userId);
    debugGoogleCalendarLog("events/route.ts:GET", "loaded connection", {
      hypothesisId: "H2",
      connected: connection.connected,
      managerSuffix: ctx.userId.slice(-6),
    });
    if (!connection.connected) {
      return NextResponse.json({ meetings: [] });
    }
    const { events, truncated } = await listGoogleCalendarEventsPaged(ctx.db, ctx.userId, timeMin, timeMax);
    const meetings = googleCalendarEventsToMeetings(events);
    if (truncated) {
      return NextResponse.json({
        meetings,
        truncated: true,
        warning: "calendar_events_truncated",
        hint: "This calendar has more events than PropLane can load for the dates shown, so some busy time may be missing. Check Google Calendar before publishing availability far out.",
      });
    }
    return NextResponse.json({ meetings, truncated: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    debugGoogleCalendarLog("events/route.ts:GET", "events fetch failed", {
      hypothesisId: "H2",
      message,
    });
    const classified = classifyGoogleCalendarEventsFetchError(message);
    if (classified) {
      return NextResponse.json({
        meetings: [],
        warning: classified.warning,
        hint: classified.hint,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const eventId = new URL(req.url).searchParams.get("eventId")?.trim() ?? "";
    if (!eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });
    const connection = await loadGoogleCalendarConnection(ctx.db, ctx.userId);
    if (!connection.connected) {
      return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });
    }
    await deleteProplaneGoogleCalendarEvent(ctx.db, ctx.userId, eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete calendar event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
