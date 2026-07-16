#!/usr/bin/env npx tsx
/**
 * Provision Twilio work numbers for managers missing one or still stamped with
 * the legacy shared Claw agent line.
 *
 * Dev/test:
 *   npx tsx --env-file=.env.local scripts/backfill-manager-work-numbers.ts
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/backfill-manager-work-numbers.ts --dry-run
 *
 * One manager by email:
 *   npx tsx --env-file=.env.local scripts/backfill-manager-work-numbers.ts --email=manager@test.axis.local
 *
 * Production (point env at prod Supabase + Twilio):
 *   npx tsx --env-file=.env.production.local scripts/backfill-manager-work-numbers.ts --limit=5
 */

import { createClient } from "@supabase/supabase-js";
import { backfillManagerWorkNumbers } from "../src/lib/backfill-manager-work-numbers.server";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const emailArg = process.argv.find((a) => a.startsWith("--email="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let managerUserId: string | undefined;
  if (emailArg) {
    const email = emailArg.split("=")[1]?.trim().toLowerCase();
    if (!email) {
      console.error("Invalid --email value.");
      process.exit(1);
    }
    const { data, error } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (error || !data?.id) {
      console.error(error?.message ?? `No profile for ${email}`);
      process.exit(1);
    }
    managerUserId = data.id;
  }

  const result = await backfillManagerWorkNumbers(db, {
    dryRun,
    managerUserId,
    limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
