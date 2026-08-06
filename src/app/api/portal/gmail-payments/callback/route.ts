import { NextResponse } from "next/server";

import { exchangeGmailPaymentsCode, verifyGmailPaymentsOAuthState } from "@/lib/gmail-payments/api.server";
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
  const oauthState = state ? verifyGmailPaymentsOAuthState(state) : null;
  const returnOrigin = oauthState?.returnOrigin ?? callbackOrigin;
  const returnPath = oauthState?.returnPath ?? "/portal/payments";

  if (oauthError) {
    const raw =
      oauthErrorDescription?.trim() ||
      (oauthError === "access_denied"
        ? "access_denied"
        : oauthError);
    return NextResponse.redirect(`${returnOrigin}${googleServiceResultPath(returnPath, "gmail", "error", raw)}`);
  }

  if (!code || !state) {
    const reason = "Google did not return an authorization code. Try Connect again.";
    return NextResponse.redirect(`${returnOrigin}${googleServiceResultPath(returnPath, "gmail", "error", reason)}`);
  }

  if (!oauthState) {
    const reason = "Gmail connect session expired. Click Connect again.";
    return NextResponse.redirect(`${callbackOrigin}${googleServiceResultPath("/portal/payments", "gmail", "error", reason)}`);
  }

  try {
    const db = createSupabaseServiceRoleClient();
    await exchangeGmailPaymentsCode(db, oauthState.userId, code, oauthState.returnOrigin, oauthState.role);
    return NextResponse.redirect(`${oauthState.returnOrigin}${googleServiceResultPath(oauthState.returnPath, "gmail", "connected")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.redirect(`${oauthState.returnOrigin}${googleServiceResultPath(oauthState.returnPath, "gmail", "error", message)}`);
  }
}
