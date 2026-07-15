#!/usr/bin/env node
/**
 * Stamp the shared Claw Messenger leasing number onto mapped manager profiles.
 *
 * Usage (dev/test DB):
 *   node --env-file=.env.local scripts/assign-claw-leasing-numbers.mjs
 *
 * Usage (production DB — point env at prod service role / URL):
 *   node --env-file=.env.production.local scripts/assign-claw-leasing-numbers.mjs
 *
 * Reads CLAW_MESSENGER_MANAGER_EMAILS (comma-separated) and CLAW_MESSENGER_AGENT_PHONE.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const phone = (process.env.CLAW_MESSENGER_AGENT_PHONE || "+12053690702").trim();
const emails = (process.env.CLAW_MESSENGER_MANAGER_EMAILS || "ogambik2@gmail.com,testeverything@test.axis.local")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const force = process.argv.includes("--force");

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!emails.length) {
  console.error("No manager emails configured.");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: profiles, error } = await db.from("profiles").select("id, email, sms_from_number").in("email", emails);
if (error) {
  console.error(error.message);
  process.exit(1);
}

if (!profiles?.length) {
  console.error("No matching profiles for:", emails.join(", "));
  process.exit(1);
}

for (const row of profiles) {
  const current = String(row.sms_from_number ?? "").trim();
  if (current && !force) {
    console.log(`skip ${row.email} (already ${current}; pass --force to overwrite)`);
    continue;
  }
  const { error: updErr } = await db
    .from("profiles")
    .update({ sms_from_number: phone, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updErr) {
    console.error(`fail ${row.email}:`, updErr.message);
    process.exit(1);
  }
  console.log(`ok ${row.email} → ${phone}`);
}

console.log("Done.");
