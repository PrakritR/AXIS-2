import { NextResponse } from "next/server";

import { exchangeGoogleCalendarCode, verifyOAuthState } from "@/lib/google-calendar/api.server";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const origin = url.origin;
  const returnTo = `${origin}/portal/calendar`;

  if (!code || !state) {
    return NextResponse.redirect(`${returnTo}?gcal=error`);
  }

  const managerUserId = verifyOAuthState(state);
  if (!managerUserId) {
    debugGoogleCalendarLog("callback/route.ts:GET", "invalid oauth state", {});
    return NextResponse.redirect(`${returnTo}?gcal=error`);
  }

  try {
    const db = createSupabaseServiceRoleClient();
    await exchangeGoogleCalendarCode(db, managerUserId, code, origin);
    debugGoogleCalendarLog("callback/route.ts:GET", "calendar connected", {
      managerSuffix: managerUserId.slice(-6),
    });
    return NextResponse.redirect(`${returnTo}?gcal=connected`);
  } catch (error) {
    debugGoogleCalendarLog("callback/route.ts:GET", "calendar connect failed", {
      managerSuffix: managerUserId.slice(-6),
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.redirect(`${returnTo}?gcal=error`);
  }
}
