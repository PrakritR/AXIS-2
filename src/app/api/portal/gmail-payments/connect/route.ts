import { NextResponse } from "next/server";

import {
  buildGmailPaymentsOAuthUrl,
  gmailPaymentsOAuthRedirectUri,
  isGmailPaymentsOAuthConfigured,
} from "@/lib/gmail-payments/api.server";
import { requireManager } from "@/lib/gmail-payments/require-manager.server";
import { warmGoogleCalendarOAuthConfig } from "@/lib/google-calendar/settings";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const originParam = url.searchParams.get("origin")?.trim();
  const origin = originParam || url.origin;
  const returnTo = `${origin.replace(/\/$/, "")}/portal/payments`;

  try {
    await warmGoogleCalendarOAuthConfig();
    if (!isGmailPaymentsOAuthConfigured()) {
      const reason = encodeURIComponent("Google OAuth is not configured on this server.");
      return NextResponse.redirect(`${returnTo}?gmail-pay=error&reason=${reason}`);
    }
    const ctx = await requireManager();
    if (!ctx) {
      const reason = encodeURIComponent("Sign in as a manager, then try again.");
      return NextResponse.redirect(`${returnTo}?gmail-pay=error&reason=${reason}`);
    }
    void gmailPaymentsOAuthRedirectUri(origin);
    const oauthUrl = buildGmailPaymentsOAuthUrl(origin, ctx.userId, "manager");
    return NextResponse.redirect(oauthUrl);
  } catch (e) {
    const reason = encodeURIComponent(e instanceof Error ? e.message : "Failed to start Gmail connect.");
    return NextResponse.redirect(`${returnTo}?gmail-pay=error&reason=${reason}`);
  }
}
