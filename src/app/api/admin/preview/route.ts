import { NextResponse } from "next/server";
import { isAdminUser, PREVIEW_PORTAL_COOKIE, PREVIEW_UID_COOKIE } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 4,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
};

type Body = { targetUserId?: string; portal?: PreviewPortal };

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
    const portal = body.portal;
    if (!targetUserId || !portal || !["manager", "resident", "owner"].includes(portal)) {
      return NextResponse.json({ error: "targetUserId and portal are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: profile, error } = await db.from("profiles").select("id, role").eq("id", targetUserId).maybeSingle();
    if (error || !profile) {
      return NextResponse.json({ error: "User not found or role does not match portal." }, { status: 400 });
    }
    const { data: roleRow } = await db
      .from("profile_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .eq("role", portal)
      .maybeSingle();
    if (!roleRow && profile.role !== portal) {
      return NextResponse.json({ error: "User not found or role does not match portal." }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(PREVIEW_UID_COOKIE, targetUserId, COOKIE_OPTS);
    res.cookies.set(PREVIEW_PORTAL_COOKIE, portal, COOKIE_OPTS);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to set preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(PREVIEW_UID_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
    res.cookies.set(PREVIEW_PORTAL_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to clear preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
