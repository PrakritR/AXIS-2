import { NextResponse } from "next/server";

import { buildGoogleCalendarOAuthUrl } from "@/lib/google-calendar/api.server";
import { debugGoogleCalendarLog } from "@/lib/google-calendar/debug-log.server";
import { isGoogleCalendarOAuthConfigured, warmGoogleCalendarOAuthConfig } from "@/lib/google-calendar/settings";
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
    await warmGoogleCalendarOAuthConfig();
    if (!isGoogleCalendarOAuthConfigured()) {
      return NextResponse.json({ error: "Google Calendar is not configured on this server." }, { status: 503 });
    }
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const origin = new URL(req.url).searchParams.get("origin")?.trim() || new URL(req.url).origin;
    const redirectUri = `${origin.replace(/\/$/, "")}/api/portal/google-calendar/callback`;
    debugGoogleCalendarLog("connect/route.ts:GET", "calendar oauth redirect", {
      managerSuffix: ctx.userId.slice(-6),
      origin,
      redirectUri,
    });
    const url = buildGoogleCalendarOAuthUrl(origin, ctx.userId);
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
