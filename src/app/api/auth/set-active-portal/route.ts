import { NextResponse } from "next/server";
import type { AuthRole } from "@/components/auth/portal-switcher";
import { ACTIVE_PORTAL_COOKIE, getPortalAccessContext, hasRole } from "@/lib/auth/portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAuthRole(value: string): value is AuthRole {
  return value === "resident" || value === "manager" || value === "owner" || value === "admin";
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { role } = (await req.json()) as { role?: string };
    if (!role || !isAuthRole(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const ctx = await getPortalAccessContext();
    if (!hasRole(ctx, role)) {
      return NextResponse.json({ error: "You do not have access to this portal." }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACTIVE_PORTAL_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
