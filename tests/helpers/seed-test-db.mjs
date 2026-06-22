#!/usr/bin/env node
/**
 * Seeds a dedicated Supabase test project with admin, manager, and sample data.
 * Usage: node --env-file=.env.test tests/helpers/seed-test-db.mjs [testRunId]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testRunId = process.argv[2]?.trim() || `seed-${Date.now()}`;

const adminEmail = (process.env.E2E_ADMIN_EMAIL ?? "admin@test.axis.local").toLowerCase();
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "TestAdmin123!";
const managerEmail = (process.env.E2E_MANAGER_EMAIL ?? "manager@test.axis.local").toLowerCase();
const managerPassword = process.env.E2E_MANAGER_PASSWORD ?? "TestManager123!";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(email, password, role, managerId = null) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });

  let userId;
  if (createErr) {
    const exists = createErr.message.toLowerCase().includes("already");
    if (!exists) throw new Error(`createUser ${email}: ${createErr.message}`);
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw new Error(`User ${email} exists but not found`);
    userId = existing.id;
    await supabase.auth.admin.updateUserById(userId, { password });
  } else {
    userId = created.user.id;
  }

  await supabase.from("profiles").upsert({
    id: userId,
    email,
    role,
    ...(managerId ? { manager_id: managerId } : {}),
    full_name: email.split("@")[0],
  });

  await supabase.from("profile_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  return userId;
}

try {
  const adminId = await ensureUser(adminEmail, adminPassword, "admin");
  const managerId = `MGR-${testRunId.slice(0, 8).toUpperCase()}`;
  const managerUserId = await ensureUser(managerEmail, managerPassword, "manager", managerId);

  await supabase.from("manager_purchases").upsert(
    {
      stripe_checkout_session_id: `seed_${testRunId}`,
      email: managerEmail,
      manager_id: managerId,
      tier: "pro",
      billing: "portal",
      user_id: managerUserId,
      promo_code: "FREE100",
    },
    { onConflict: "manager_id" },
  );

  const propertyId = `test-prop-${testRunId}`;
  await supabase.from("manager_property_records").insert({
    manager_id: managerId,
    row_data: {
      id: propertyId,
      status: "live",
      name: `Seed Property ${testRunId}`,
      testRunId,
    },
  });

  console.log(JSON.stringify({ ok: true, testRunId, adminId, managerUserId, managerId, propertyId }));
} catch (err) {
  console.error(err);
  process.exit(1);
}
