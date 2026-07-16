import { NextResponse } from "next/server";
import { backfillManagerWorkNumbers } from "@/lib/backfill-manager-work-numbers.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily sweep: provision up to 10 manager work numbers per run (idempotent). */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  const result = await backfillManagerWorkNumbers(db, { limit: 10 });
  return NextResponse.json({ ok: true, ...result });
}
