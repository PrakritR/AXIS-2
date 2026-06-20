#!/usr/bin/env node
/**
 * Restores manager accounts deleted by the former non-admin wipe.
 * Creates auth + profiles + profile_roles from manager_purchases, links purchases,
 * relinks orphaned property records, and sends password recovery links.
 *
 * Usage (from repo root):
 *   node --env-file=.env scripts/restore-deleted-managers.mjs
 *
 * Skips test accounts: testfree@gmail.com, testpro@gmail.com
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const SKIP_EMAILS = new Set(["testfree@gmail.com", "testpro@gmail.com"]);

/** Known pre-wipe auth UUID → email for property relink after restore */
const OLD_AUTH_BY_EMAIL = {
  "hiteshkjm@gmail.com": "9f1bd79c-c004-4e90-a122-b71e2f193a5c",
};

const HITESH_PROPERTY_IDS = ["mgr--new-listing-5fhxik", "pend-1781917854771-5fhxik"];

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function primaryRoleWhenAddingManager(existingRole) {
  const r = (existingRole ?? "").toLowerCase();
  if (r === "admin" || r === "owner") return existingRole;
  return "manager";
}

async function findAuthUserIdByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error || !data?.users) return null;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureProfileRoleRow(userId, role) {
  const { error } = await supabase.from("profile_roles").upsert(
    { user_id: userId, role },
    { onConflict: "user_id,role" },
  );
  if (error) throw new Error(`profile_roles: ${error.message}`);
}

async function sendRecoveryLink(email) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/auth/sign-in` },
  });
  if (error) {
    console.warn(`  recovery link failed for ${email}:`, error.message);
    return null;
  }
  const link = data?.properties?.action_link ?? data?.action_link ?? null;
  if (link) console.log(`  recovery link: ${link}`);
  return link;
}

async function relinkPropertiesForManager(userId, email, oldAuthId) {
  const emailLower = email.toLowerCase();
  let updated = 0;

  if (emailLower === "hiteshkjm@gmail.com") {
    for (const propId of HITESH_PROPERTY_IDS) {
      const { data: row } = await supabase.from("manager_property_records").select("*").eq("id", propId).maybeSingle();
      if (!row) continue;

      const propertyData = row.property_data && typeof row.property_data === "object"
        ? { ...row.property_data, managerUserId: userId }
        : row.property_data;
      const rowData = row.row_data && typeof row.row_data === "object"
        ? { ...row.row_data, submittedByUserId: userId }
        : row.row_data;

      const { error } = await supabase.from("manager_property_records").update({
        manager_user_id: userId,
        property_data: propertyData,
        row_data: rowData,
        updated_at: new Date().toISOString(),
      }).eq("id", propId);

      if (error) {
        console.warn(`  property relink ${propId}:`, error.message);
      } else {
        updated++;
      }
    }
  }

  if (oldAuthId) {
    const { data: byOldId } = await supabase.from("manager_property_records").select("id, property_data, row_data");
    for (const row of byOldId ?? []) {
      if (HITESH_PROPERTY_IDS.includes(row.id)) continue;
      const embedded = row.property_data?.managerUserId || row.row_data?.submittedByUserId;
      if (embedded !== oldAuthId) continue;

      const propertyData = row.property_data && typeof row.property_data === "object"
        ? { ...row.property_data, managerUserId: userId }
        : row.property_data;
      const rowData = row.row_data && typeof row.row_data === "object"
        ? { ...row.row_data, submittedByUserId: userId }
        : row.row_data;

      const { error } = await supabase.from("manager_property_records").update({
        manager_user_id: userId,
        property_data: propertyData,
        row_data: rowData,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);

      if (!error) updated++;
    }
  }

  return updated;
}

async function restoreManager(purchase) {
  const email = purchase.email.trim().toLowerCase();
  const fullName = purchase.full_name?.trim() || null;
  const managerId = purchase.manager_id;

  let userId = await findAuthUserIdByEmail(email);
  let created = false;

  if (!userId) {
    const tempPassword = randomBytes(24).toString("base64url");
    const { data: createdUser, error: cErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: "manager", manager_id: managerId },
    });

    if (cErr) {
      const exists = cErr.message.toLowerCase().includes("already") || cErr.message.toLowerCase().includes("registered");
      if (!exists) throw new Error(`createUser ${email}: ${cErr.message}`);
      userId = await findAuthUserIdByEmail(email);
      if (!userId) throw new Error(`createUser ${email}: user exists but not found in list`);
    } else {
      if (!createdUser?.user?.id) throw new Error(`createUser ${email}: no user returned`);
      userId = createdUser.user.id;
      created = true;
    }
  }

  const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  const { error: pErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      role: primaryRoleWhenAddingManager(existingProfile?.role),
      manager_id: managerId,
      full_name: fullName || existingProfile?.full_name || null,
      application_approved: existingProfile?.application_approved ?? true,
    },
    { onConflict: "id" },
  );
  if (pErr) throw new Error(`profiles ${email}: ${pErr.message}`);

  await ensureProfileRoleRow(userId, "manager");

  const { error: linkErr } = await supabase
    .from("manager_purchases")
    .update({ user_id: userId })
    .ilike("email", email);
  if (linkErr) throw new Error(`manager_purchases link ${email}: ${linkErr.message}`);

  const oldAuthId = OLD_AUTH_BY_EMAIL[email] ?? null;
  const propsUpdated = await relinkPropertiesForManager(userId, email, oldAuthId);

  let recoveryLink = null;
  if (created) {
    recoveryLink = await sendRecoveryLink(email);
  } else {
    recoveryLink = await sendRecoveryLink(email);
  }

  return { email, userId, managerId, created, propsUpdated, recoveryLink };
}

async function relinkAkashOrphanPending() {
  const akashId = await findAuthUserIdByEmail("akashvjain@gmail.com");
  if (!akashId) {
    console.warn("Akash auth user not found; skipping orphan pending relink.");
    return;
  }

  const pendingId = "pend-1781919161076-rfvj87";
  const oldAuthId = "9bf1fb44-9d4a-41d9-9a90-edf4283cc9f4";

  const { data: row } = await supabase.from("manager_property_records").select("*").eq("id", pendingId).maybeSingle();
  if (!row) return;

  const rowData = row.row_data && typeof row.row_data === "object"
    ? { ...row.row_data, submittedByUserId: akashId }
    : row.row_data;

  const { error } = await supabase.from("manager_property_records").update({
    manager_user_id: akashId,
    row_data: rowData,
    updated_at: new Date().toISOString(),
  }).eq("id", pendingId);

  if (error) {
    console.warn(`Akash pending relink: ${error.message}`);
  } else {
    console.log(`Relinked ${pendingId} → akashvjain@gmail.com (${akashId})`);
  }

  void oldAuthId;
}

async function deleteTestPurchases() {
  const { error, count } = await supabase
    .from("manager_purchases")
    .delete({ count: "exact" })
    .in("email", ["testfree@gmail.com", "testpro@gmail.com"]);

  if (error) {
    console.warn("Delete test purchases:", error.message);
  } else {
    console.log(`Deleted ${count ?? 0} test manager_purchases row(s).`);
  }
}

async function main() {
  const { data: purchases, error } = await supabase
    .from("manager_purchases")
    .select("*")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("manager_purchases:", error.message);
    process.exit(1);
  }

  await deleteTestPurchases();

  const byEmail = new Map();
  for (const p of purchases ?? []) {
    const email = p.email?.trim().toLowerCase();
    if (!email || SKIP_EMAILS.has(email)) continue;
    if (!byEmail.has(email)) byEmail.set(email, p);
  }

  const toRestore = [];
  for (const [, purchase] of byEmail) {
    const email = purchase.email.trim().toLowerCase();
    const existingAuth = await findAuthUserIdByEmail(email);
    if (!existingAuth) toRestore.push(purchase);
  }

  console.log(`Restoring ${toRestore.length} manager account(s)...\n`);

  const results = [];
  for (const purchase of toRestore) {
    try {
      const result = await restoreManager(purchase);
      results.push(result);
      console.log(
        `${result.created ? "Created" : "Updated"} ${result.email} → ${result.userId} (${result.managerId}), ${result.propsUpdated} propert(ies) relinked`,
      );
    } catch (e) {
      console.error(`FAILED ${purchase.email}:`, e instanceof Error ? e.message : e);
    }
  }

  await relinkAkashOrphanPending();

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
