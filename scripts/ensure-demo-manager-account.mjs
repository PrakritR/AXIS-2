#!/usr/bin/env node
/**
 * Creates or updates a manager demo account (Supabase Auth + profiles + profile_roles).
 * Same env vars as scripts/ensure-admin-account.mjs
 *
 * Usage:
 *   node --env-file=.env scripts/ensure-demo-manager-account.mjs demo.manager@example.com 'YourPasswordHere' "Demo Manager"
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const emailArg = process.argv[2]?.trim();
const passwordArg = process.argv[3];
const fullNameArg = process.argv[4]?.trim();

const email = (emailArg || process.env.EMAIL || "").trim().toLowerCase();
const password = passwordArg ?? process.env.PASSWORD ?? "";
const fullName = fullNameArg || process.env.FULL_NAME || "Demo Manager";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error("Usage: node --env-file=.env scripts/ensure-demo-manager-account.mjs <email> <password> [full name]");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: "manager" },
});

let userId;

if (createErr) {
  const msg = createErr.message.toLowerCase();
  const exists = msg.includes("already") || msg.includes("registered");
  if (!exists) {
    console.error("createUser:", createErr.message);
    process.exit(1);
  }
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr || !listData?.users?.length) {
    console.error("listUsers:", listErr?.message ?? "no users");
    process.exit(1);
  }
  const existing = listData.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) {
    console.error("User exists but could not be found in first 1000 users.");
    process.exit(1);
  }
  userId = existing.id;
  const { error: updErr } = await supabase.auth.admin.updateUserById(userId, { password });
  if (updErr) {
    console.error("updateUserById:", updErr.message);
    process.exit(1);
  }
  console.log("Updated password for existing user:", email);
} else {
  if (!created.user) {
    console.error("No user returned from createUser.");
    process.exit(1);
  }
  userId = created.user.id;
  console.log("Created user:", email);
}

const managerId = `mgr_${userId.slice(0, 8)}`;

const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

const { error: pErr } = await supabase.from("profiles").upsert(
  {
    id: userId,
    email,
    role: "manager",
    manager_id: existingProfile?.manager_id ?? managerId,
    full_name: fullName,
    application_approved: true,
  },
  { onConflict: "id" },
);
if (pErr) {
  console.error("profiles upsert:", pErr.message);
  process.exit(1);
}

const { error: rErr } = await supabase.from("profile_roles").upsert({ user_id: userId, role: "manager" }, { onConflict: "user_id,role" });
if (rErr) {
  console.error("profile_roles upsert:", rErr.message);
  process.exit(1);
}

console.log("Manager role synced on profiles + profile_roles. Sign in at /auth/sign-in as", email);
