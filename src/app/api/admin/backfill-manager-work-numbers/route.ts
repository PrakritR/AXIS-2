import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { backfillManagerWorkNumbers } from "@/lib/backfill-manager-work-numbers.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** One-time / batched repair: provision Twilio work numbers for managers missing one. */
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

    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      dryRun?: boolean;
      managerUserId?: string;
    };

    const db = createSupabaseServiceRoleClient();
    const result = await backfillManagerWorkNumbers(db, {
      limit: body.limit,
      dryRun: body.dryRun,
      managerUserId: body.managerUserId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to backfill manager work numbers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
