import { NextResponse } from "next/server";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { loadResidentTourViews } from "@/lib/tour-resident-link.server";

export const runtime = "nodejs";

/** Scoped tour list for the signed-in resident — linked inquiry ids only. */
export async function GET() {
  try {
    const { user } = await getEffectiveSessionForPortal("resident");
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const ctx = await getPortalAccessContext();
    const preview = await getAdminPreviewFromCookies();
    const mayAccessResidentPortal =
      hasRole(ctx, "resident") || (hasAdminRole(ctx) && preview?.portal === "resident");
    if (!mayAccessResidentPortal) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const db = createSupabaseServiceRoleClient();
    const tours = await loadResidentTourViews(db, user.id);
    return NextResponse.json({ tours });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tours.";
    if (/resident_tour_links|schema cache/i.test(message)) {
      return NextResponse.json({ tours: [], degraded: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
