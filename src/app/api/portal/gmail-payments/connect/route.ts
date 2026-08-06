import { NextResponse } from "next/server";

import {
  buildGmailPaymentsOAuthUrl,
  gmailPaymentsOAuthRedirectUri,
  isGmailPaymentsOAuthConfigured,
} from "@/lib/gmail-payments/api.server";
import { requireManager } from "@/lib/gmail-payments/require-manager.server";
import { warmGoogleCalendarOAuthConfig } from "@/lib/google-calendar/settings";
import {
  googleServiceResultPath,
  normalizeGoogleServiceReturnPath,
} from "@/lib/auth/manager-google-services";
import { resolveRequestOrigin } from "@/lib/app-url";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = resolveRequestOrigin(req);
  const returnPath = normalizeGoogleServiceReturnPath(url.searchParams.get("returnTo"), "/portal/payments");

  try {
    await warmGoogleCalendarOAuthConfig();
    if (!isGmailPaymentsOAuthConfigured()) {
      const reason = "Google OAuth is not configured on this server.";
      return NextResponse.redirect(`${origin.replace(/\/$/, "")}${googleServiceResultPath(returnPath, "gmail", "error", reason)}`);
    }
    const ctx = await requireManager();
    if (!ctx) {
      const reason = "Sign in as a manager, then try again.";
      return NextResponse.redirect(`${origin.replace(/\/$/, "")}${googleServiceResultPath(returnPath, "gmail", "error", reason)}`);
    }
    void gmailPaymentsOAuthRedirectUri(origin);
    const oauthUrl = buildGmailPaymentsOAuthUrl(origin, ctx.userId, "manager", returnPath);
    return NextResponse.redirect(oauthUrl);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Failed to start Gmail connect.";
    return NextResponse.redirect(`${origin.replace(/\/$/, "")}${googleServiceResultPath(returnPath, "gmail", "error", reason)}`);
  }
}
