#!/usr/bin/env node
/**
 * Stamp the shared Claw agent line onto opted-in manager profiles while A2P
 * is pending. Does not touch other accounts.
 *
 *   node --env-file=.env.local scripts/stamp-claw-manager-numbers.mjs
 *
 * Emails come from CLAW_MESSENGER_MANAGER_EMAILS (comma-separated), defaulting
 * to testeverything@test.axis.local + ogambik2@gmail.com + manager@test.axis.local.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const clawPhone =
    process.env.CLAW_MESSENGER_AGENT_PHONE?.trim() ||
    process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE?.trim() ||
    "+12053690702";

  const fromEnv = (process.env.CLAW_MESSENGER_MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emails = [
    ...fromEnv,
    "testeverything@test.axis.local",
    "manager@test.axis.local",
    "ogambik2@gmail.com",
  ];
  const uniqueEmails = [...new Set(emails)];

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await db.from("profiles").select("id, email, sms_from_number").in("email", uniqueEmails);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const results = [];
  for (const row of data ?? []) {
    const { error: updErr } = await db
      .from("profiles")
      .update({ sms_from_number: clawPhone, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    results.push({
      email: row.email,
      previous: row.sms_from_number,
      next: clawPhone,
      ok: !updErr,
      error: updErr?.message,
    });
  }

  console.log(JSON.stringify({ clawPhone, updated: results }, null, 2));
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
