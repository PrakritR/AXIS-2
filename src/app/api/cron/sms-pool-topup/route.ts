import { NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/server-env";
import { topUpRelayPool } from "@/lib/sms-relay.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return !isProductionRuntime();
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Hourly cron: release expired cooldowns and keep the relay pool pre-warmed
 * (numbers must sit in the Messaging Service a while before their A2P
 * registration propagates — buying just-in-time risks the first message being
 * carrier-filtered). Hard-capped at RELAY_POOL_MAX inside topUpRelayPool.
 *
 * Auto-buy is dark unless SMS_RELAY_POOL_AUTOBUY=1: each number costs real
 * money monthly, and the current Twilio A2P brand is a Sole Proprietor one
 * (exactly ONE local number allowed) — extra numbers would be unregistered and
 * carrier-filtered. Flip the flag only once a Standard brand exists.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.SMS_RELAY_POOL_AUTOBUY?.trim() !== "1") {
    return NextResponse.json({ skipped: true, reason: "SMS_RELAY_POOL_AUTOBUY is not enabled." });
  }
  const db = createSupabaseServiceRoleClient();
  const result = await topUpRelayPool(db);
  return NextResponse.json(result);
}
