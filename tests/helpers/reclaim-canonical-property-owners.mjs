#!/usr/bin/env node
/**
 * Reclaim canonical catalog properties whose `manager_property_records.manager_user_id`
 * has drifted onto another account.
 *
 * WHY THIS EXISTS. `/portal/properties` reads `manager_property_records` scoped
 * strictly to `manager_user_id = <viewer>` (+ accepted co-manager links), while
 * Residents, Applications, and the Communication property filter read
 * DENORMALIZED property labels off application/lease rows
 * (`propertyOptionsFromContacts` in src/lib/manager-inbox-contacts.ts). So a
 * property row that changes owner takes the Properties tab to 0/0/0 and leaves
 * every other surface looking healthy — the failure is invisible until someone
 * opens that one tab.
 *
 * The seed's other coherence checks cannot see it: cleanup step 1 selects rows
 * `.in("manager_user_id", testManagerIds)`, so a canonical id parked on a
 * stranger's account is simply absent from the result. Worse, the account prune
 * deletes `manager_property_records` by stray `manager_user_id` — a canonical id
 * still mis-owned at prune time is DELETED rather than reclaimed. Run this
 * before the prune.
 *
 * Standalone repair (dev/test project only — never production):
 *   node --env-file=.env.test tests/helpers/reclaim-canonical-property-owners.mjs
 *
 * That reclaims the canonical demo portfolio to the CANONICAL demo manager
 * (manager@test.proplane.local) without running the full seed, so it does not
 * prune anyone else's sandbox accounts. It always targets that account and
 * REFUSES to run when E2E_MANAGER_EMAIL names a different one: the canonical
 * portfolio belongs to the canonical manager by definition, so keying the
 * repair on a mutable env override was the original mistake — a stale value
 * (e.g. the legacy manager@test.axis.local) would make this script perform the
 * exact drift it exists to repair.
 */
import { createClient } from "@supabase/supabase-js";
import { assertTestProjectUrl } from "./canonical-test-accounts.mjs";

/**
 * The five houses `/demo` and the manager@ workflow portfolio are built on.
 * Kept here (not inline in the seed) so the seed and the standalone repair
 * cannot drift apart about what "canonical" means.
 */
export const CANONICAL_DEMO_PORTFOLIO_PROPERTY_IDS = [
  "mgr-demo-pioneer",
  "mgr-demo-cascade",
  "mgr-demo-emerald",
  "mgr-demo-lakeview",
  "mgr-demo-ballard",
];

// Keep in sync with src/lib/demo/demo-canonical-accounts.ts (plain-node script
// can't import the TS module).
export const CANONICAL_DEMO_MANAGER_EMAIL = "manager@test.proplane.local";

/**
 * The owner this script reclaims TO — always the canonical demo manager.
 *
 * `E2E_MANAGER_EMAIL` may legitimately be overridden for the full seed (CI does
 * it, and the seed passes its own resolved owner map in here), but the
 * STANDALONE repair must never follow it: pointing this script at another
 * account makes it move all five canonical properties onto that account, which
 * is precisely the drift it exists to undo. So a non-canonical value is a loud
 * error rather than a silently inverted repair.
 */
export function resolveCanonicalReclaimManagerEmail(env = process.env) {
  const configured = String(env?.E2E_MANAGER_EMAIL ?? "").trim().toLowerCase();
  if (!configured || configured === CANONICAL_DEMO_MANAGER_EMAIL) return CANONICAL_DEMO_MANAGER_EMAIL;
  throw new Error(
    `E2E_MANAGER_EMAIL is set to ${configured} but the canonical demo portfolio belongs to ` +
      `${CANONICAL_DEMO_MANAGER_EMAIL}. Reclaiming to ${configured} would move all ` +
      `${CANONICAL_DEMO_PORTFOLIO_PROPERTY_IDS.length} canonical properties onto that account — ` +
      `the exact drift this script exists to repair. Update E2E_MANAGER_EMAIL in .env.test to ` +
      `${CANONICAL_DEMO_MANAGER_EMAIL} (or unset it) and re-run.`,
  );
}

/**
 * Force every listed property back onto its intended owner.
 *
 * `expectedOwnerByPropertyId` is `{ [propertyId]: managerUserId }`. Rows that are
 * already correct are left untouched; rows that do not exist are reported rather
 * than created (creating one needs the full listing submission, which only the
 * seed has). The owner is written to the `manager_user_id` COLUMN and mirrored
 * into the `property_data` / `row_data` blobs, because those blobs are what the
 * browser mirrors back to `POST /api/property-records`.
 *
 * Throws if a row is still mis-owned after the write — a silent half-repair is
 * how this drift survived a seed run in the first place.
 */
export async function reclaimCanonicalPropertyOwners(supabase, expectedOwnerByPropertyId, opts = {}) {
  const log = opts.log ?? ((msg) => console.error(msg));
  const ids = Object.keys(expectedOwnerByPropertyId).filter((id) => id.trim());
  if (ids.length === 0) return { reclaimed: [], missing: [] };

  const { data: rows, error } = await supabase
    .from("manager_property_records")
    .select("id, manager_user_id, property_data, row_data")
    .in("id", ids);
  if (error) throw new Error(`reclaim: select manager_property_records: ${error.message}`);

  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  const reclaimed = [];

  for (const [id, expectedOwner] of Object.entries(expectedOwnerByPropertyId)) {
    const row = byId.get(id);
    if (!row || !expectedOwner?.trim()) continue;
    const currentOwner = String(row.manager_user_id ?? "").trim();
    if (currentOwner === expectedOwner.trim()) continue;

    const patch = { manager_user_id: expectedOwner, updated_at: new Date().toISOString() };
    if (row.property_data && typeof row.property_data === "object") {
      patch.property_data = { ...row.property_data, managerUserId: expectedOwner };
    }
    if (row.row_data && typeof row.row_data === "object") {
      patch.row_data = { ...row.row_data, managerUserId: expectedOwner };
    }
    const { error: updErr } = await supabase.from("manager_property_records").update(patch).eq("id", id);
    if (updErr) throw new Error(`reclaim: update ${id}: ${updErr.message}`);
    reclaimed.push({ id, from: currentOwner || "(none)", to: expectedOwner });
  }

  if (reclaimed.length) {
    log(
      `Reclaimed ${reclaimed.length} canonical properties whose owner had drifted: ` +
        reclaimed.map((r) => `${r.id} (${r.from} -> ${r.to})`).join(", "),
    );
  }
  if (missing.length) log(`Canonical properties absent from manager_property_records: ${missing.join(", ")}`);

  // Re-read rather than trusting the UPDATE's status — the whole point of this
  // helper is that "the write said ok" was not enough evidence last time.
  const { data: after, error: afterErr } = await supabase
    .from("manager_property_records")
    .select("id, manager_user_id")
    .in("id", ids);
  if (afterErr) throw new Error(`reclaim: verify manager_property_records: ${afterErr.message}`);
  const stillWrong = (after ?? []).filter((row) => {
    // Skip blank expectations exactly like the update loop does — the helper
    // deliberately left those rows alone, so they cannot be "still mis-owned".
    const expected = String(expectedOwnerByPropertyId[row.id] ?? "").trim();
    if (!expected) return false;
    return String(row.manager_user_id ?? "").trim() !== expected;
  });
  if (stillWrong.length) {
    throw new Error(
      `reclaim: ${stillWrong.length} canonical properties are still mis-owned after the repair: ` +
        stillWrong.map((r) => `${r.id}=${r.manager_user_id}`).join(", "),
    );
  }

  return { reclaimed, missing };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  assertTestProjectUrl(url);

  const managerEmail = resolveCanonicalReclaimManagerEmail(process.env);
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let managerUserId = "";
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === managerEmail);
    if (hit) {
      managerUserId = hit.id;
      break;
    }
    if (data.users.length < 1000) break;
  }
  if (!managerUserId) throw new Error(`No auth user for ${managerEmail} — run npm run test:seed first.`);

  const expected = Object.fromEntries(
    CANONICAL_DEMO_PORTFOLIO_PROPERTY_IDS.map((id) => [id, managerUserId]),
  );
  const result = await reclaimCanonicalPropertyOwners(supabase, expected);
  console.log(
    `Canonical demo portfolio owned by ${managerEmail} (${managerUserId}): ` +
      `${CANONICAL_DEMO_PORTFOLIO_PROPERTY_IDS.length - result.missing.length} properties, ` +
      `${result.reclaimed.length} reclaimed.`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
