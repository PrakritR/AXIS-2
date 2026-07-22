#!/usr/bin/env npx tsx
/**
 * Seed ANY dev/test manager account with an id-namespaced copy of the demo
 * portfolio — properties, applications, charges, leases, vendors, work orders
 * (incl. bids/offers/payouts), service requests, inbox threads, and calendar
 * events — without touching the canonical sandbox accounts' rows.
 *
 * CURRENTLY INERT: it copies `buildDemoIdleSnapshot()`
 * (`src/lib/demo/demo-guided-data.ts`), which now ships EMPTY, so it creates the
 * accounts and prints honest "properties 0" counts until a demo portfolio
 * exists again. That snapshot is the seam; `DEMO_PORTAL_MIRROR_ENABLED`
 * (`src/lib/demo/demo-mirror-flag.ts`) is the switch that puts the canonical
 * accounts' rows back in front of `/demo`. The script is kept for that day.
 *
 *   npx tsx scripts/seed-dev-manager-portfolio.ts <manager-email> [prefix]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
 * environment, falling back to .env. Refuses to run against the production
 * Supabase project. The manager auth account must already exist (sign up
 * first); resident/vendor counterpart accounts (<prefix>.resident@axis.local,
 * <prefix>.vendor@axis.local) are created idempotently so the portfolio's
 * linked resident and vendor are real, signable-in accounts. @axis.local
 * addresses are treated as demo addresses everywhere — no real email is ever
 * sent to them.
 *
 * Row ids are namespaced (demo-hc-3 -> <prefix>-hc-<disc>3, mgr-demo-pioneer
 * -> <prefix>-prop-pioneer, AXIS-DEMOAPP5 -> AXIS-<PREFIX>5; <disc> is a
 * per-account digit discriminator), so this portfolio coexists with the
 * canonical one and other script-seeded accounts. To wipe it: delete rows
 * with manager_user_id = '<manager-id>' from the portfolio tables, inbox
 * threads owned by the manager/resident/vendor user ids, and (optionally)
 * the two <prefix>.*@axis.local counterpart accounts.
 *
 * WARNING: `npm run test:seed` prunes every non-canonical account (including
 * the account seeded here) — re-run this script after a full reseed.
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isProductionSupabaseProjectUrl } from "../tests/helpers/canonical-production-accounts.mjs";
import {
  CANONICAL_DEMO_MANAGER_EMAIL,
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_VENDOR_EMAIL,
} from "@/lib/demo/demo-canonical-accounts";
import { buildDemoIdleSnapshot, type DemoDataSnapshot } from "@/lib/demo/demo-guided-data";
import { remapDemoSnapshotForDb } from "@/lib/demo/demo-portfolio-db-remap";
import { seedCanonicalDemoPortfolio } from "@/lib/demo/canonical-demo-portfolio-db";

// ---- env (process env first, .env fallback) --------------------------------

function loadDotEnvFallback() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}
loadDotEnvFallback();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env).");
  process.exit(1);
}

// Hard production guard, fail-closed: the helper falls back to the HARDCODED
// production ref when AXIS_PROD_SUPABASE_REF is unset, so a trimmed .env can't
// silently disable it. Also honor the historical misspelled key from .env.
const misspelledRef = process.env.AXIS_PROD_SUPABSE_REF?.trim();
if (
  isProductionSupabaseProjectUrl(url) ||
  (misspelledRef && new URL(url).hostname === `${misspelledRef}.supabase.co`)
) {
  console.error("Refusing to seed the production Supabase project.");
  process.exit(1);
}

// ---- args ------------------------------------------------------------------

const managerEmail = process.argv[2]?.trim().toLowerCase();
if (!managerEmail || !managerEmail.includes("@")) {
  console.error("Usage: npx tsx scripts/seed-dev-manager-portfolio.ts <manager-email> [prefix]");
  process.exit(1);
}
// Letters only: digits in the prefix would pollute the writer's digit-derived
// stable uuids (demoStableUuid keys off the FIRST digit run in the id).
const prefix = (process.argv[3]?.trim().toLowerCase() || managerEmail.split("@")[0]!).replace(
  /[^a-z]/g,
  "",
);
if (!prefix || prefix === "demo" || prefix === "mgr") {
  console.error("Could not derive a usable id prefix (letters only, not 'demo'/'mgr'); pass one explicitly.");
  process.exit(1);
}
const PREFIX_UPPER = prefix.toUpperCase();
const residentEmail = `${prefix}.resident@axis.local`;
const vendorEmail = `${prefix}.vendor@axis.local`;
const residentAxisId = `AXIS-${PREFIX_UPPER}R`;

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ---- helpers ---------------------------------------------------------------

async function findUserIdByEmail(client: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

/** Create-or-fetch a counterpart auth user; never overwrites an existing password. */
async function ensureCounterpartUser(email: string, password: string, role: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (!error) return data.user.id;
  if (!error.message.toLowerCase().includes("already")) {
    throw new Error(`createUser ${email}: ${error.message}`);
  }
  const existing = await findUserIdByEmail(db, email);
  if (!existing) throw new Error(`User ${email} exists but was not found.`);
  return existing;
}

/**
 * Namespace every row id in the already-remapped snapshot so nothing collides
 * with the canonical sandbox portfolio or another script-seeded account.
 * Numeric ids get an account discriminator prepended (demo-hc-3 ->
 * <prefix>-hc-<disc>3): the writer's stable uuids derive from the first digit
 * run in the id, so the digits themselves must be unique per account.
 */
function namespaceSnapshot(snapshot: DemoDataSnapshot, managerUserId: string): DemoDataSnapshot {
  const disc = String(parseInt(managerUserId.replace(/-/g, "").slice(0, 6), 16));
  const text = JSON.stringify(snapshot)
    .replaceAll(CANONICAL_DEMO_RESIDENT_EMAIL, residentEmail)
    .replaceAll(CANONICAL_DEMO_VENDOR_EMAIL, vendorEmail)
    .replaceAll(CANONICAL_DEMO_MANAGER_EMAIL, managerEmail)
    .replaceAll("mgr-demo-", `${prefix}-prop-`)
    // Rent-profile ids are digit-free (`demo-rent-<email>`) — rename explicitly.
    .replaceAll("demo-rent-", `${prefix}-rent-`)
    .replace(/demo-([a-z]+)-(\d+)/g, `${prefix}-$1-${disc}$2`)
    .replace(/AXIS-DEMOAPP(\d+)/g, `AXIS-${PREFIX_UPPER}$1`);

  // Fail closed if future demo data introduces an id shape none of the rules
  // caught — a leftover canonical id would silently reassign a canonical row.
  // (bugFeedback/adminInbox/residentUploads keep demo ids: never persisted.)
  const parsed = JSON.parse(text) as DemoDataSnapshot;
  const persisted: Record<string, unknown> = { ...parsed };
  delete persisted.bugFeedback;
  delete persisted.adminInbox;
  delete persisted.residentUploads;
  const leftover = JSON.stringify(persisted).match(/"(?:mgr-)?demo-[^"]*"/g);
  if (leftover) {
    throw new Error(`Unnamespaced demo ids remain (update namespaceSnapshot): ${[...new Set(leftover)].join(", ")}`);
  }
  return parsed;
}

// ---- main ------------------------------------------------------------------

async function main() {
  const { data: managerProfile, error } = await db
    .from("profiles")
    .select("id, email, role, full_name, application_approved")
    .ilike("email", managerEmail)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup: ${error.message}`);
  if (!managerProfile) {
    throw new Error(`No profile for ${managerEmail} — sign the account up first.`);
  }
  if (managerProfile.role !== "manager") {
    throw new Error(`${managerEmail} has role "${managerProfile.role}", expected "manager".`);
  }

  // The prefix owns the id namespace: refuse to reuse one that another
  // manager's rows already occupy (same-local-part emails, reruns are fine).
  const { data: prefixRows } = await db
    .from("manager_property_records")
    .select("manager_user_id")
    .like("id", `${prefix}-prop-%`)
    .neq("manager_user_id", managerProfile.id)
    .limit(1);
  if (prefixRows?.length) {
    throw new Error(`Prefix "${prefix}" is already used by another account — pass a different prefix.`);
  }

  const residentUserId = await ensureCounterpartUser(residentEmail, "TestResident123!", "resident");
  const vendorUserId = await ensureCounterpartUser(vendorEmail, "TestVendor123!", "vendor");

  // Remap with the CANONICAL emails so the linked-resident/vendor matching in
  // remapDemoSnapshotForDb fires, then namespace ids and swap in the real
  // counterpart emails.
  const remapCtx = {
    managerUserId: managerProfile.id as string,
    residentUserId,
    vendorUserId,
    residentEmail: CANONICAL_DEMO_RESIDENT_EMAIL,
    vendorEmail: CANONICAL_DEMO_VENDOR_EMAIL,
    residentAxisId,
  };
  const snapshot = namespaceSnapshot(
    remapDemoSnapshotForDb(buildDemoIdleSnapshot(), remapCtx),
    managerProfile.id as string,
  );

  try {
    await seedCanonicalDemoPortfolio(
      db,
      { ...remapCtx, residentEmail, vendorEmail, managerEmail },
      { snapshot, skipGlobalScheduleSingletons: true },
    );
  } finally {
    // The shared writer stamps the canonical demo display name (and clears
    // application_approved) on the manager profile; restore the account's
    // real identity no matter what.
    await db
      .from("profiles")
      .update({
        email: managerEmail,
        full_name: managerProfile.full_name,
        role: "manager",
        application_approved: managerProfile.application_approved,
      })
      .eq("id", managerProfile.id);
  }

  console.log(
    [
      `Seeded portfolio for ${managerEmail} (${managerProfile.id})`,
      `  id prefix:  ${prefix}-*  (properties ${prefix}-prop-*)`,
      `  resident:   ${residentEmail}  (password TestResident123! if newly created)`,
      `  vendor:     ${vendorEmail}  (password TestVendor123! if newly created)`,
      `  properties ${snapshot.properties.length}, applications ${snapshot.applications.length},`,
      `  charges ${snapshot.charges.length}, leases ${snapshot.leases.length}, work orders ${snapshot.workOrders.length},`,
      `  vendors ${snapshot.vendors.length}, service requests ${snapshot.serviceRequests.length}, inbox threads ${
        snapshot.managerInbox.length + snapshot.residentInbox.length + snapshot.vendorInbox.length
      }`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
