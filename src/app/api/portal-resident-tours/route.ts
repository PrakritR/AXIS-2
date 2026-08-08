import { NextResponse } from "next/server";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { loadResidentTourViews, linkAllTourInquiriesForEmail } from "@/lib/tour-resident-link.server";

export const runtime = "nodejs";

/** Scoped tour list for the signed-in resident — linked inquiry ids only. */
export async function GET() {
  try {
    const { user, profile } = await getEffectiveSessionForPortal("resident");
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const ctx = await getPortalAccessContext();
    const preview = await getAdminPreviewFromCookies();
    const mayAccessResidentPortal =
      hasRole(ctx, "resident") || (hasAdminRole(ctx) && preview?.portal === "resident");
    if (!mayAccessResidentPortal) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const db = createSupabaseServiceRoleClient();
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
    if (email.includes("@")) {
      await linkAllTourInquiriesForEmail(db, { userId: user.id, email });
    }
    const tours = await loadResidentTourViews(db, user.id);
    return NextResponse.json({ tours });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tours.";
    // A failed read is NOT an empty tour list. This used to answer 200 with
    // `{tours: [], degraded: true}` when `resident_tour_links` was missing from
    // the schema cache, and the panel cleared its error on that flag — so a
    // resident holding a CONFIRMED tour was told, confidently, that they had
    // none. Every failure now leaves as a failure; `degraded` survives only to
    // tell the client this is the recoverable "try again" shape.
    if (/resident_tour_links|schema cache/i.test(message)) {
      return NextResponse.json(
        { error: "We could not load your tours right now. Try again in a moment.", degraded: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
