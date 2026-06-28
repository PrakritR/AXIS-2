#!/usr/bin/env node
/**
 * Seeds a dedicated Supabase test project with admin, manager, resident, and sample data.
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
const residentEmail = (process.env.E2E_RESIDENT_EMAIL ?? "resident@test.axis.local").toLowerCase();
const residentPassword = process.env.E2E_RESIDENT_PASSWORD ?? "TestResident123!";

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
      address: "123 Test St, San Francisco, CA 94105",
      testRunId,
    },
  });

  // ── Resident account ──────────────────────────────────────────────────────
  const residentUserId = await ensureUser(residentEmail, residentPassword, "resident");

  // Approved application linking resident to manager
  const applicationId = `test-app-${testRunId}`;
  const residentAxisId = `AXIS-${testRunId.slice(0, 8).toUpperCase()}`;

  await supabase.from("manager_application_records").insert({
    id: applicationId,
    manager_id: managerId,
    manager_user_id: managerUserId,
    resident_email: residentEmail,
    row_data: {
      id: applicationId,
      bucket: "approved",
      email: residentEmail,
      name: "Test Resident",
      axisId: residentAxisId,
      managerUserId,
      assignedPropertyId: propertyId,
      leaseTerm: "12 months",
      leaseStart: new Date().toISOString().slice(0, 10),
      signedRent: 2500,
      testRunId,
    },
  });

  // Update resident profile with axis_id and mark application_approved
  await supabase.from("profiles").upsert({
    id: residentUserId,
    email: residentEmail,
    role: "resident",
    full_name: "Test Resident",
    application_approved: true,
  });

  // Household charge for resident
  const chargeId = `test-charge-${testRunId}`;
  await supabase.from("portal_household_charge_records").insert({
    id: chargeId,
    manager_user_id: managerUserId,
    resident_user_id: residentUserId,
    resident_email: residentEmail,
    scope: "household",
    row_data: {
      id: chargeId,
      kind: "rent",
      status: "due",
      label: "Rent – Test Month",
      amountCents: 250000,
      dueDateLabel: "1st of month",
      residentEmail,
      managerUserId,
      testRunId,
    },
  });

  // Tour / schedule record for manager
  const tourId = `test-tour-${testRunId}`;
  const tourStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const tourEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
  await supabase.from("portal_schedule_records").insert({
    id: tourId,
    manager_user_id: managerUserId,
    record_type: "event",
    starts_at: tourStart,
    ends_at: tourEnd,
    row_data: {
      id: tourId,
      title: "Test Tour",
      type: "tour",
      propertyId,
      managerUserId,
      testRunId,
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      testRunId,
      adminId,
      managerUserId,
      managerId,
      propertyId,
      residentUserId,
      residentEmail,
      residentAxisId,
      applicationId,
      chargeId,
      tourId,
    }),
  );
} catch (err) {
  console.error(err);
  process.exit(1);
}
