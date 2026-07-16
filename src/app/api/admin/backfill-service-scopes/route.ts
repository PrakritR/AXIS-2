import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { repairServiceScopesAllManagers } from "@/lib/repair-service-request-scopes.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Historical repair: re-stamps `manager_user_id` / `property_id` on orphaned
 * service requests and work orders so they appear in the correct manager
 * Services portal. Optional body `{ managerUserId }` scopes to one landlord.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { managerUserId?: string };
    const managerUserId = body.managerUserId?.trim() || undefined;

    const db = createSupabaseServiceRoleClient();
    const result = await repairServiceScopesAllManagers(db, managerUserId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to backfill service scopes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
