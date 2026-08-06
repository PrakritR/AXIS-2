import { NextResponse } from "next/server";

import { exchangeGoogleCalendarCode, verifyOAuthState } from "@/lib/google-calendar/api.server";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { googleServiceResultPath } from "@/lib/auth/manager-google-services";
import { resolveRequestOrigin } from "@/lib/app-url";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const callbackOrigin = resolveRequestOrigin(req);
  const oauthState = state ? verifyOAuthState(state) : null;
  const returnOrigin = oauthState?.returnOrigin ?? callbackOrigin;
  const returnPath = oauthState?.returnPath ?? "/portal/calendar";

  if (oauthError) {
    debugGoogleCalendarLog("callback/route.ts:GET", "google oauth error redirect", {
      hypothesisId: "H2",
      error: oauthError,
      description: oauthErrorDescription?.slice(0, 200) ?? null,
    });
    const reason = oauthErrorDescription ?? oauthError;
    return NextResponse.redirect(`${returnOrigin}${googleServiceResultPath(returnPath, "calendar", "error", reason)}`);
  }

  if (!code || !state) {
    const reason = "Google did not return an authorization code. Try Connect again.";
    return NextResponse.redirect(`${returnOrigin}${googleServiceResultPath(returnPath, "calendar", "error", reason)}`);
  }

  if (!oauthState) {
    debugGoogleCalendarLog("callback/route.ts:GET", "invalid oauth state", { hypothesisId: "H17" });
    const reason = "Calendar connect session expired or was invalid. Click Connect again and approve in Google.";
    return NextResponse.redirect(`${callbackOrigin}${googleServiceResultPath("/portal/calendar", "calendar", "error", reason)}`);
  }

  try {
    const db = createSupabaseServiceRoleClient();
    await exchangeGoogleCalendarCode(db, oauthState.userId, code, oauthState.returnOrigin);
    debugGoogleCalendarLog("callback/route.ts:GET", "calendar connected", {
      hypothesisId: "H2",
      runId: "post-fix-v8",
      managerSuffix: oauthState.userId.slice(-6),
      returnOrigin: oauthState.returnOrigin,
      callbackOrigin,
    });
    return NextResponse.redirect(`${oauthState.returnOrigin}${googleServiceResultPath(oauthState.returnPath, "calendar", "connected")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    debugGoogleCalendarLog("callback/route.ts:GET", "calendar connect failed", {
      managerSuffix: oauthState.userId.slice(-6),
      message,
    });
    return NextResponse.redirect(`${oauthState.returnOrigin}${googleServiceResultPath(oauthState.returnPath, "calendar", "error", message)}`);
  }
}
