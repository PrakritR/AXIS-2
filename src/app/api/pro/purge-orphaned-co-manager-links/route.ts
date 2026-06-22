import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { purgeOrphanedCoManagerLinks } from "@/lib/auth/purge-orphaned-co-manager-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const [{ data: profile }, admin] = await Promise.all([
      db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      isAdminUser(user.id),
    ]);
    const role = String(profile?.role ?? "").toLowerCase();
    if (!admin && role !== "manager" && role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await purgeOrphanedCoManagerLinks(db, { managerUserId: admin ? null : user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to purge orphaned co-manager links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
