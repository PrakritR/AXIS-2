#!/usr/bin/env node
/**
 * Production-only comprehensive portal seed. Populates the live Supabase project
 * with @axis.local demo accounts and a full manager workflow dataset so every
 * portal role can be exercised on the production site without touching dev/test.
 *
 * NEVER commit production credentials. Pull them from Vercel when needed:
 *   vercel env pull .env.production.local --environment=production
 *
 * One-time / refresh run (from repo root):
 *   ALLOW_PRODUCTION_SEED=1 AXIS_PROD_DEMO_PASSWORD='your-demo-password' \
 *   node --env-file=.env.production.local scripts/seed-production-portal.mjs
 *
 * Demo sign-in (after seed):
 *   Manager  alex.morgan@axis.local
 *   Resident jordan.lee@axis.local      (signed lease, active rent)
 *   Vendor   cascade.mechanical@axis.local
 *   Password: value of AXIS_PROD_DEMO_PASSWORD
 *
 * Idempotent: re-run to refresh dates and upsert rows. Only touches the demo
 * manager's scope plus the three @axis.local portal accounts above.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertProductionProjectUrl,
  assertProductionSeedGate,
  PROD_DEMO_MANAGER_EMAIL,
  PROD_DEMO_RESIDENT_EMAIL,
  PROD_DEMO_RESIDENT_NAME,
  PROD_DEMO_VENDOR_EMAIL,
  PROD_DEMO_VENDOR_NAME,
} from "../tests/helpers/canonical-production-accounts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.AXIS_PROD_DEMO_PASSWORD?.trim();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Pull production creds: vercel env pull .env.production.local --environment=production");
  process.exit(1);
}
if (!demoPassword || demoPassword.length < 8) {
  console.error("Set AXIS_PROD_DEMO_PASSWORD (min 8 chars) for all @axis.local demo accounts.");
  process.exit(1);
}

assertProductionSeedGate();
assertProductionProjectUrl(url);

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NOW = new Date();
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86400000);

async function must(promise, label) {
  const { error, data } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function ensureUser(email, password, role, { onlyRole = false } = {}) {
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  let user = list.users.find((u) => u.email?.toLowerCase() === email);

  if (!user) {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });
    if (createErr) throw new Error(`createUser ${email}: ${createErr.message}`);
    user = created.user;
    console.log(`Created ${role} auth user: ${email}`);
  } else {
    const { error: updateErr } = await sb.auth.admin.updateUserById(user.id, { password });
    if (updateErr) throw new Error(`updateUserById ${email}: ${updateErr.message}`);
  }

  await must(
    sb.from("profiles").upsert(
      {
        id: user.id,
        email,
        role,
        full_name: email.split("@")[0],
      },
      { onConflict: "id" },
    ),
    `profiles(${email})`,
  );
  await must(
    sb.from("profile_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" }),
    `profile_roles(${email})`,
  );
  if (onlyRole) {
    await must(
      sb.from("profile_roles").delete().eq("user_id", user.id).neq("role", role),
      `profile_roles(strip stray roles for ${email})`,
    );
  }
  return user.id;
}

async function resolveManagerUserId() {
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  const user = list.users.find((u) => u.email?.toLowerCase() === PROD_DEMO_MANAGER_EMAIL);
  if (!user) throw new Error(`Manager ${PROD_DEMO_MANAGER_EMAIL} not found — workflow seed may have failed.`);
  return user.id;
}

async function seedProductionExtras(managerUserId) {
  const residentUserId = await ensureUser(PROD_DEMO_RESIDENT_EMAIL, demoPassword, "resident", { onlyRole: true });
  const vendorUserId = await ensureUser(PROD_DEMO_VENDOR_EMAIL, demoPassword, "vendor", { onlyRole: true });

  const magnoliaId = "mgr-prod-prop-magnolia";
  const cascadeId = "mgr-prod-prop-birch";

  const vendorDirectoryId = "prod-vendor-cascade-mech";
  await must(
    sb.from("manager_vendor_records").upsert(
      {
        id: vendorDirectoryId,
        manager_user_id: managerUserId,
        vendor_user_id: vendorUserId,
        row_data: {
          id: vendorDirectoryId,
          managerUserId,
          name: PROD_DEMO_VENDOR_NAME,
          trade: "HVAC",
          trades: ["HVAC", "Plumbing"],
          phone: "(206) 555-0142",
          email: PROD_DEMO_VENDOR_EMAIL,
          notes: "Production demo vendor — @axis.local (no outbound email).",
          active: true,
        },
        updated_at: NOW.toISOString(),
      },
      { onConflict: "id" },
    ),
    "manager_vendor_records(vendor)",
  );

  const workOrders = [
    {
      id: "prod-wo-scheduled-hvac",
      propertyId: cascadeId,
      propertyName: "Birch Court — 4 rooms",
      title: "HVAC seasonal tune-up",
      bucket: "scheduled",
      status: "Scheduled",
      days: 5,
      cost: "18500",
      vendorCostCents: 18500,
    },
    {
      id: "prod-wo-open-plumbing",
      propertyId: magnoliaId,
      propertyName: "Magnolia House — 5 rooms",
      title: "Kitchen faucet drip",
      bucket: "open",
      status: "Open",
      days: null,
      cost: "",
      vendorCostCents: null,
    },
    {
      id: "prod-wo-completed-filter",
      propertyId: magnoliaId,
      propertyName: "Magnolia House — 5 rooms",
      title: "Furnace filter replacement",
      bucket: "completed",
      status: "Completed",
      days: -14,
      cost: "9500",
      vendorCostCents: 9500,
      materialsCostCents: 2500,
      paidAt: daysFromNow(-7).toISOString(),
    },
  ];

  for (const wo of workOrders) {
    await must(
      sb.from("portal_work_order_records").upsert(
        {
          id: wo.id,
          manager_user_id: managerUserId,
          resident_email: PROD_DEMO_RESIDENT_EMAIL,
          property_id: wo.propertyId,
          assigned_property_id: wo.propertyId,
          vendor_user_id: wo.bucket === "scheduled" || wo.bucket === "completed" ? vendorUserId : null,
          row_data: {
            id: wo.id,
            propertyName: wo.propertyName,
            unit: "Room 1",
            title: wo.title,
            priority: "normal",
            status: wo.status,
            bucket: wo.bucket,
            description: `Production demo work order (${wo.bucket}).`,
            scheduled: wo.days != null ? isoDate(daysFromNow(wo.days)) : "",
            scheduledAtIso: wo.days != null ? daysFromNow(wo.days).toISOString() : "",
            cost: wo.cost ? String(Number(wo.cost) / 100) : "",
            vendorCostCents: wo.vendorCostCents,
            materialsCostCents: wo.materialsCostCents ?? 0,
            residentName: PROD_DEMO_RESIDENT_NAME,
            residentEmail: PROD_DEMO_RESIDENT_EMAIL,
            propertyId: wo.propertyId,
            assignedPropertyId: wo.propertyId,
            managerUserId,
            vendorId: wo.bucket === "scheduled" || wo.bucket === "completed" ? vendorDirectoryId : "",
            vendorName: wo.bucket === "scheduled" || wo.bucket === "completed" ? PROD_DEMO_VENDOR_NAME : "",
            vendorAssignedAt: wo.bucket === "scheduled" || wo.bucket === "completed" ? NOW.toISOString() : "",
            category: wo.title.toLowerCase().includes("hvac") ? "hvac" : "plumbing",
            biddingOpen: wo.bucket === "open",
            paidAt: wo.paidAt ?? null,
            prodDemo: true,
          },
          updated_at: NOW.toISOString(),
        },
        { onConflict: "id" },
      ),
      `portal_work_order_records(${wo.id})`,
    );
  }

  const serviceRequestId = "prod-sr-storage";
  await must(
    sb.from("portal_service_request_records").upsert(
      {
        id: serviceRequestId,
        manager_user_id: managerUserId,
        resident_email: PROD_DEMO_RESIDENT_EMAIL,
        property_id: cascadeId,
        row_data: {
          id: serviceRequestId,
          title: "Extra storage unit",
          residentName: PROD_DEMO_RESIDENT_NAME,
          residentEmail: PROD_DEMO_RESIDENT_EMAIL,
          propertyId: cascadeId,
          status: "approved",
          priceLabel: "$45.00",
          managerUserId,
          prodDemo: true,
        },
        updated_at: NOW.toISOString(),
      },
      { onConflict: "id" },
    ),
    "portal_service_request_records",
  );

  const tourId = "prod-tour-magnolia";
  const tourStart = daysFromNow(7).toISOString();
  const tourEnd = new Date(daysFromNow(7).getTime() + 60 * 60 * 1000).toISOString();
  await must(
    sb.from("portal_schedule_records").upsert(
      {
        id: tourId,
        manager_user_id: managerUserId,
        record_type: "event",
        starts_at: tourStart,
        ends_at: tourEnd,
        row_data: {
          id: tourId,
          title: "Property tour",
          type: "tour",
          propertyId: magnoliaId,
          managerUserId,
          guestName: "Demo Prospect",
          guestEmail: "prospect.seed@axis.local",
          prodDemo: true,
        },
      },
      { onConflict: "id" },
    ),
    "portal_schedule_records",
  );

  const inboxThreadId = "prod-inbox-manager-resident";
  await must(
    sb.from("portal_inbox_thread_records").upsert(
      {
        id: inboxThreadId,
        owner_user_id: managerUserId,
        participant_email: PROD_DEMO_RESIDENT_EMAIL,
        row_data: {
          id: inboxThreadId,
          subject: "Welcome to Magnolia House",
          preview: "Hi Jordan — your lease is ready to review…",
          messages: [
            {
              id: "prod-inbox-msg-1",
              fromEmail: PROD_DEMO_MANAGER_EMAIL,
              toEmail: PROD_DEMO_RESIDENT_EMAIL,
              body: "Hi Jordan — welcome! Your lease documents are ready in the portal.",
              sentAt: daysFromNow(-2).toISOString(),
            },
            {
              id: "prod-inbox-msg-2",
              fromEmail: PROD_DEMO_RESIDENT_EMAIL,
              toEmail: PROD_DEMO_MANAGER_EMAIL,
              body: "Thanks Alex! I'll review and sign this week.",
              sentAt: daysFromNow(-1).toISOString(),
            },
          ],
          unread: false,
          prodDemo: true,
        },
        updated_at: NOW.toISOString(),
      },
      { onConflict: "id" },
    ),
    "portal_inbox_thread_records",
  );

  console.log("Production extras seeded:", {
    residentUserId,
    vendorUserId,
    vendorDirectoryId,
    workOrders: workOrders.map((w) => w.id),
    serviceRequestId,
    tourId,
    inboxThreadId,
  });
}

function runWorkflowSeed() {
  const workflowPath = join(__dirname, "seed-demo-manager-workflow.mjs");
  const result = spawnSync(process.execPath, [workflowPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_TARGET: "production",
      SEED_MANAGER_EMAIL: PROD_DEMO_MANAGER_EMAIL,
      SEED_MANAGER_PASSWORD: demoPassword,
      SEED_AUTO_RESIDENT_PASSWORD: demoPassword,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Workflow seed exited with code ${result.status ?? "unknown"}`);
  }
}

try {
  console.log("\n=== Production portal seed (workflow) ===\n");
  runWorkflowSeed();

  console.log("\n=== Production portal seed (vendor / work orders / inbox) ===\n");
  const managerUserId = await resolveManagerUserId();
  await seedProductionExtras(managerUserId);

  console.log("\n=== Done. Sign in on the live site with @axis.local demo accounts. ===\n");
  console.log("  Manager:", PROD_DEMO_MANAGER_EMAIL);
  console.log("  Resident:", PROD_DEMO_RESIDENT_EMAIL);
  console.log("  Vendor:", PROD_DEMO_VENDOR_EMAIL);
  console.log("  Password: (AXIS_PROD_DEMO_PASSWORD)\n");
} catch (err) {
  console.error("\nPRODUCTION SEED FAILED:", err.message);
  process.exit(1);
}
