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
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createSupabaseServiceRoleClient();
  const result = await topUpRelayPool(db);
  return NextResponse.json(result);
}
