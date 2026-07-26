import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendWeeklyRentReminders } from "@/lib/sms/weekly-rent-reminder.server";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Weekly rent-reminder SMS from each manager's own PropLane number. Scheduled
 * daily but idempotent PER ISO WEEK (the dedup row is claimed before sending),
 * so at most one reminder per resident per week even across retries / a failed
 * day / a duplicate tick. Consent + quiet-hours + per-manager registration
 * gating are all applied inside sendWeeklyRentReminders.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createSupabaseServiceRoleClient();
  const result = await sendWeeklyRentReminders(db);
  return NextResponse.json({ ok: true, ...result });
}
