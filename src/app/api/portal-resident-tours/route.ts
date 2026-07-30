import { NextResponse } from "next/server";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { loadResidentTourViews } from "@/lib/tour-resident-link.server";

export const runtime = "nodejs";

/** Scoped tour list for the signed-in resident — linked inquiry ids only. */
export async function GET() {
  try {
    const { user, profile } = await getEffectiveSessionForPortal("resident");
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (profile?.role && profile.role !== "resident") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const db = createSupabaseServiceRoleClient();
    const tours = await loadResidentTourViews(db, user.id);
    return NextResponse.json({ tours });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tours.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
