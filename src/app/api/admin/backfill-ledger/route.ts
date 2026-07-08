import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { backfillLedgerFromCharges } from "@/lib/reports/ledger-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * One-time/historical repair: sweeps portal_household_charge_records into
 * ledger_entries. Never called automatically — run manually per environment
 * after deploying the write-through ledger sync (see AGENTS.md, "Financials
 * Phase 0"). Optionally scope to one managerUserId via the request body.
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
    const result = await backfillLedgerFromCharges(db, managerUserId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to backfill ledger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
