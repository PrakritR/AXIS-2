#!/usr/bin/env node
/**
 * Repair resident identity drift on the dev/test project: denormalized email
 * copies that disagree with the authoritative column, and canonical-account
 * inbox threads still addressed to pre-rename `@test.axis.local` identities.
 *
 * WHY THIS EXISTS. Server routes authorize on the `resident_email` COLUMN, but
 * several client surfaces re-filter on the copy embedded in `row_data`. When the
 * two disagree the server hands the row over and the client throws it away, so
 * the feature is dead with no error anywhere:
 *
 *  - `findLeaseForResidentEmail` (src/lib/lease-pipeline-storage.ts) matches
 *    `row.residentEmail` exactly, so a Fully Signed lease whose `row_data` still
 *    said `resident@test.axis.local` was invisible on /resident/lease,
 *    /resident/documents/lease and the dashboard — while the charge generator,
 *    keyed off the column, kept billing rent under it.
 *  - The inbox "connected people" gate (src/lib/inbox-recipient-scope.ts)
 *    resolves the resident's managers by column and compares them to the address
 *    stored on the thread. A thread still addressed to `manager@test.axis.local`
 *    therefore 403s every reply.
 *
 * Both are DATA repairs by deliberate decision: the product does NOT carry a
 * legacy-domain equivalence shim on the lease or messaging paths (applications
 * do, in src/lib/rental-application/resident-application-ownership.ts). So a
 * future email change or a typo can reintroduce this class of failure; that
 * residual risk is accepted and tracked, not silently closed by this script.
 *
 * Run (dev/test project only — never production):
 *   npm run test:seed:repair-identity-drift
 *   node --env-file=.env.test tests/helpers/repair-resident-identity-drift.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { assertTestProjectUrl } from "./canonical-test-accounts.mjs";

/** Domains the pre-rename sandbox used. A thread addressed to one of these is a candidate. */
const LEGACY_EMAIL_DOMAINS = ["test.axis.local", "axis.local"];

/** Canonical account whose portal the drift disables. Keep in sync with tests/README.md. */
export const CANONICAL_DEMO_RESIDENT_EMAIL = "resident@test.proplane.local";

/**
 * Tables carrying a `resident_email` column PLUS a denormalized copy in
 * `row_data`. The column is authoritative — it is what every server route
 * scopes on — so the repair always rewrites the copy to match it, never the
 * other way round.
 */
const DENORMALIZED_EMAIL_TABLES = [
  { table: "portal_lease_pipeline_records", keys: ["residentEmail"] },
  { table: "manager_application_records", keys: ["email", "residentEmail"] },
  { table: "portal_household_charge_records", keys: ["residentEmail"] },
  { table: "portal_work_order_records", keys: ["residentEmail"] },
  { table: "portal_service_request_records", keys: ["residentEmail"] },
];

const norm = (value) => String(value ?? "").trim().toLowerCase();

/**
 * PostgREST caps every select at `max_rows` (1000 in supabase/config.toml, and
 * the hosted default), so a `.limit(5000)` is silently truncated to the first
 * page. A scan that trusts it under-repairs, and a verification re-read that
 * trusts it re-reads the SAME truncated window and reports success anyway.
 * Every scan in this script therefore pages with `.range()`, ordered by `id` so
 * the pages partition the table.
 *
 * The cursor advances by the rows actually RETURNED and stops only on an empty
 * page, never on a short one: `max_rows` is a per-project dashboard setting the
 * repo does not govern, so a project capped below `SCAN_PAGE_SIZE` would make
 * the very first page short and reintroduce the same silent truncation.
 */
const SCAN_PAGE_SIZE = 1000;

async function selectAllRows(supabase, { table, columns, label, filter }) {
  const rows = [];
  for (let from = 0; ; ) {
    let query = supabase.from(table).select(columns);
    if (filter) query = filter(query);
    const { data, error } = await query.order("id", { ascending: true }).range(from, from + SCAN_PAGE_SIZE - 1);
    if (error) throw new Error(`repair: ${label ?? "select"} ${table}: ${error.message}`);
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
  }
}

/** The `@test.proplane.local` address a legacy sandbox address corresponds to, if any. */
export function proplaneTwinForLegacyEmail(email) {
  const value = norm(email);
  const [local, domain] = value.split("@");
  if (!local || !LEGACY_EMAIL_DOMAINS.includes(domain)) return "";
  return `${local}@test.proplane.local`;
}

/**
 * Rewrite every `row_data` email copy that disagrees with the `resident_email`
 * column. Safe to run globally: it never chooses between two accounts, it only
 * makes a denormalized copy agree with the column that already governs access.
 */
export async function repairDenormalizedResidentEmails(supabase, opts = {}) {
  const dryRun = opts.dryRun === true;
  const log = opts.log ?? ((msg) => console.log(msg));
  const repaired = [];

  for (const { table, keys } of DENORMALIZED_EMAIL_TABLES) {
    const rows = await selectAllRows(supabase, { table, columns: "id, resident_email, row_data", label: "select" });

    for (const row of rows) {
      const column = norm(row.resident_email);
      const rowData = row.row_data && typeof row.row_data === "object" ? row.row_data : null;
      if (!column || !rowData) continue;

      const patch = {};
      for (const key of keys) {
        const embedded = norm(rowData[key]);
        if (embedded && embedded !== column) patch[key] = column;
      }
      if (Object.keys(patch).length === 0) continue;

      repaired.push({ table, id: row.id, keys: Object.keys(patch), from: norm(rowData[Object.keys(patch)[0]]), to: column });
      if (dryRun) continue;
      const { error: updErr } = await supabase
        .from(table)
        .update({ row_data: { ...rowData, ...patch } })
        .eq("id", row.id);
      if (updErr) throw new Error(`repair: update ${table} ${row.id}: ${updErr.message}`);
    }
  }

  log(
    repaired.length === 0
      ? "Denormalized resident emails: already consistent with their columns."
      : `${dryRun ? "Would repair" : "Repaired"} ${repaired.length} denormalized resident email copies: ` +
          repaired.map((r) => `${r.table}/${r.id} (${r.from} -> ${r.to})`).join(", "),
  );
  return repaired;
}

/**
 * Re-address the canonical resident's inbox threads that still name a
 * pre-rename identity, so the recipient-scope gate can recognise their manager.
 *
 * Deliberately scoped to ONE account rather than rewriting the domain across the
 * whole project: several `@test.axis.local` addresses are still real accounts
 * with their own inboxes, and rewriting a thread they own would re-point a live
 * conversation at a different user. A counterparty is rewritten only when its
 * `@test.proplane.local` twin exists as a profile AND the result is not the
 * resident themselves (that would fabricate a message-to-self out of an already
 * bogus row — left visible instead, for a re-seed to clear).
 */
export async function repairCanonicalResidentThreadAddresses(supabase, opts = {}) {
  const dryRun = opts.dryRun === true;
  const log = opts.log ?? ((msg) => console.log(msg));
  const residentEmail = norm(opts.residentEmail ?? CANONICAL_DEMO_RESIDENT_EMAIL);

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", residentEmail)
    .maybeSingle();
  if (profErr) throw new Error(`repair: select resident profile: ${profErr.message}`);
  if (!profile?.id) {
    log(`No profile for ${residentEmail} — skipping thread repair (run npm run test:seed first).`);
    return { repaired: [], skipped: [] };
  }

  const threads = await selectAllRows(supabase, {
    table: "portal_inbox_thread_records",
    columns: "id, owner_user_id, participant_email, row_data",
    label: "select threads for",
    filter: (q) => q.or(`owner_user_id.eq.${profile.id},participant_email.eq.${residentEmail}`),
  });

  // Truncating this scan would classify a real `@test.proplane.local` twin as
  // "no account" and silently skip the thread, so it pages like the rest.
  const profiles = await selectAllRows(supabase, { table: "profiles", columns: "id, email", label: "select" });
  const knownEmails = new Set(profiles.map((p) => norm(p.email)).filter(Boolean));

  const repaired = [];
  const skipped = [];
  for (const thread of threads) {
    const rowData = thread.row_data && typeof thread.row_data === "object" ? thread.row_data : null;
    if (!rowData) continue;
    const current = norm(rowData.email);
    const twin = proplaneTwinForLegacyEmail(current);
    if (!twin) continue;
    if (!knownEmails.has(twin)) {
      skipped.push({ id: thread.id, email: current, why: "no @test.proplane.local account" });
      continue;
    }
    if (twin === residentEmail) {
      skipped.push({ id: thread.id, email: current, why: "would address the resident's own thread to themselves" });
      continue;
    }
    repaired.push({ id: thread.id, from: current, to: twin });
    if (dryRun) continue;
    const { error: updErr } = await supabase
      .from("portal_inbox_thread_records")
      .update({ row_data: { ...rowData, email: twin } })
      .eq("id", thread.id);
    if (updErr) throw new Error(`repair: update thread ${thread.id}: ${updErr.message}`);
  }

  log(
    repaired.length === 0
      ? `Inbox threads for ${residentEmail}: no legacy counterparty addresses to repair.`
      : `${dryRun ? "Would re-address" : "Re-addressed"} ${repaired.length} threads for ${residentEmail}: ` +
          repaired.map((r) => `${r.id} (${r.from} -> ${r.to})`).join(", "),
  );
  if (skipped.length) {
    log(
      `Left ${skipped.length} threads untouched: ` +
        skipped.map((s) => `${s.id} [${s.email}] — ${s.why}`).join(", "),
    );
  }
  return { repaired, skipped };
}

/**
 * Point the resident's stored axis id at the application that actually made
 * them a resident.
 *
 * The seed's model (tests/helpers/seed-test-db.mjs) is that the application
 * record id IS the resident's axis id, and `profiles.manager_id` +
 * `user_metadata.axis_id` both store it. On a project that has accumulated
 * audit and e2e applications those two drift onto some other row, and
 * `residentLeaseAuthorized` (src/lib/lease-pipeline-storage.ts) then refuses the
 * lease: it compares the stored axis id to `row.axisId`, and when they differ it
 * only relents if the application that id names shares the lease's manager. A
 * stored id naming a REJECTED application under a DIFFERENT manager therefore
 * hides a Fully Signed lease just as effectively as a stale email does.
 *
 * Only repairs when the resident has exactly ONE approved application — with
 * none or several there is no evidence for which one is the residency, and a
 * guess here re-points the resident at the wrong manager.
 */
export async function repairResidentAxisId(supabase, opts = {}) {
  const dryRun = opts.dryRun === true;
  const log = opts.log ?? ((msg) => console.log(msg));
  const residentEmail = norm(opts.residentEmail ?? CANONICAL_DEMO_RESIDENT_EMAIL);

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, manager_id")
    .eq("email", residentEmail)
    .maybeSingle();
  if (profErr) throw new Error(`repair: select resident profile: ${profErr.message}`);
  if (!profile?.id) return null;

  const { data: apps, error: appErr } = await supabase
    .from("manager_application_records")
    .select("id, row_data")
    .eq("resident_email", residentEmail);
  if (appErr) throw new Error(`repair: select applications: ${appErr.message}`);
  const approved = (apps ?? []).filter((a) => norm(a.row_data?.bucket) === "approved");
  if (approved.length !== 1) {
    log(
      `Resident axis id for ${residentEmail}: left alone — ${approved.length} approved applications ` +
        `(need exactly 1 to know which residency the axis id should name).`,
    );
    return null;
  }

  const axisId = String(approved[0].id).trim();
  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const metaAxisId = String(authUser?.user?.user_metadata?.axis_id ?? "").trim();
  const currentProfileAxisId = String(profile.manager_id ?? "").trim();
  if (currentProfileAxisId === axisId && metaAxisId === axisId) {
    log(`Resident axis id for ${residentEmail}: already ${axisId}.`);
    return null;
  }

  log(
    `${dryRun ? "Would set" : "Set"} resident axis id for ${residentEmail} to ${axisId} ` +
      `(profiles.manager_id was ${currentProfileAxisId || "(none)"}, user_metadata.axis_id was ${metaAxisId || "(none)"}).`,
  );
  if (dryRun) return { axisId, from: currentProfileAxisId, metaFrom: metaAxisId };

  const { error: updErr } = await supabase.from("profiles").update({ manager_id: axisId }).eq("id", profile.id);
  if (updErr) throw new Error(`repair: update profiles.manager_id: ${updErr.message}`);
  const { error: metaErr } = await supabase.auth.admin.updateUserById(profile.id, {
    user_metadata: { ...(authUser?.user?.user_metadata ?? {}), axis_id: axisId },
  });
  if (metaErr) throw new Error(`repair: update user_metadata.axis_id: ${metaErr.message}`);
  return { axisId, from: currentProfileAxisId, metaFrom: metaAxisId };
}

/**
 * Re-read after writing and throw if anything is still drifted. The write
 * reporting success is not evidence — that assumption is exactly how this drift
 * survived a seed run before (see reclaim-canonical-property-owners.mjs).
 */
async function verifyNoDenormalizedDrift(supabase) {
  const stillWrong = [];
  for (const { table, keys } of DENORMALIZED_EMAIL_TABLES) {
    const rows = await selectAllRows(supabase, { table, columns: "id, resident_email, row_data", label: "verify" });
    for (const row of rows) {
      const column = norm(row.resident_email);
      const rowData = row.row_data && typeof row.row_data === "object" ? row.row_data : null;
      if (!column || !rowData) continue;
      for (const key of keys) {
        const embedded = norm(rowData[key]);
        if (embedded && embedded !== column) stillWrong.push(`${table}/${row.id}.${key}=${embedded} != ${column}`);
      }
    }
  }
  if (stillWrong.length) {
    throw new Error(`repair: ${stillWrong.length} rows still drifted after the repair: ${stillWrong.join(", ")}`);
  }
}

/** Re-read each re-addressed thread and throw if the new counterparty did not stick. */
async function verifyThreadAddressesRepaired(supabase, repaired) {
  const stillWrong = [];
  for (const entry of repaired) {
    const { data, error } = await supabase
      .from("portal_inbox_thread_records")
      .select("id, row_data")
      .eq("id", entry.id)
      .maybeSingle();
    if (error) throw new Error(`repair: verify thread ${entry.id}: ${error.message}`);
    const current = norm(data?.row_data?.email);
    if (current !== entry.to) stillWrong.push(`${entry.id}.email=${current || "(missing)"} != ${entry.to}`);
  }
  if (stillWrong.length) {
    throw new Error(`repair: ${stillWrong.length} threads still misaddressed after the repair: ${stillWrong.join(", ")}`);
  }
}

/**
 * Re-read BOTH halves of the axis-id repair. `auth.admin.updateUserById` is the
 * easiest of the three writes to report success without taking effect, and a
 * stale `user_metadata.axis_id` hides the lease exactly as a stale
 * `profiles.manager_id` does — so neither is trusted on its own return value.
 */
async function verifyResidentAxisId(supabase, residentEmail, result) {
  if (!result) return;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, manager_id")
    .eq("email", residentEmail)
    .maybeSingle();
  if (error) throw new Error(`repair: verify resident profile: ${error.message}`);
  if (!profile?.id) throw new Error(`repair: verify axis id: no profile for ${residentEmail} after the repair.`);

  const problems = [];
  const storedProfileAxisId = String(profile.manager_id ?? "").trim();
  if (storedProfileAxisId !== result.axisId) {
    problems.push(`profiles.manager_id=${storedProfileAxisId || "(none)"} != ${result.axisId}`);
  }
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(profile.id);
  if (authErr) throw new Error(`repair: verify user_metadata.axis_id: ${authErr.message}`);
  const storedMetaAxisId = String(authUser?.user?.user_metadata?.axis_id ?? "").trim();
  if (storedMetaAxisId !== result.axisId) {
    problems.push(`user_metadata.axis_id=${storedMetaAxisId || "(none)"} != ${result.axisId}`);
  }
  if (problems.length) {
    throw new Error(`repair: axis id for ${residentEmail} did not stick: ${problems.join(", ")}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  assertTestProjectUrl(url);

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await repairDenormalizedResidentEmails(supabase, { dryRun });
  const threadRepair = await repairCanonicalResidentThreadAddresses(supabase, { dryRun });
  const axisIdRepair = await repairResidentAxisId(supabase, { dryRun });
  if (!dryRun) {
    await verifyNoDenormalizedDrift(supabase);
    await verifyThreadAddressesRepaired(supabase, threadRepair.repaired);
    await verifyResidentAxisId(supabase, CANONICAL_DEMO_RESIDENT_EMAIL, axisIdRepair);
  }
  console.log(dryRun ? "Dry run complete — nothing written." : "Resident identity drift repaired and verified.");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
