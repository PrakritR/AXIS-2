#!/usr/bin/env node
/**
 * One-off: set Supabase password + profiles/profile_roles for an admin user.
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the environment.
 *
 * Usage (from repo root, with .env loaded):
 *   node --env-file=.env scripts/ensure-admin-account.mjs prakritramachandran@gmail.com 'YourPasswordHere'
 *
 * Or:
 *   EMAIL=x PASSWORD=y node --env-file=.env scripts/ensure-admin-account.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const emailArg = process.argv[2]?.trim();
const passwordArg = process.argv[3];
const email = (emailArg || process.env.EMAIL || "").trim().toLowerCase();
const password = passwordArg ?? process.env.PASSWORD ?? "";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error("Usage: node --env-file=.env scripts/ensure-admin-account.mjs <email> <password>");
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: "admin" },
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
    console.error("User exists but could not be found in first 1000 users. Add via Supabase Dashboard.");
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

const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

const { error: pErr } = await supabase.from("profiles").upsert(
  {
    id: userId,
    email,
    role: "admin",
    manager_id: existingProfile?.manager_id ?? null,
    full_name: existingProfile?.full_name ?? null,
    application_approved: existingProfile?.application_approved ?? true,
  },
  { onConflict: "id" },
);
if (pErr) {
  console.error("profiles upsert:", pErr.message);
  process.exit(1);
}

const { error: rErr } = await supabase.from("profile_roles").upsert(
  { user_id: userId, role: "admin" },
  { onConflict: "user_id,role" },
);
if (rErr) {
  console.error("profile_roles upsert:", rErr.message);
  process.exit(1);
}

console.log("Admin role synced on profiles + profile_roles. You can sign in at /auth/sign-in");
