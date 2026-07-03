#!/usr/bin/env node
/**
 * Seed a RICH, relationship-consistent, end-to-end dev dataset for the canonical
 * test manager `manager@test.axis.local` so every stage of the manager workflow
 * is populated for intensive testing:
 *
 *   Properties (Listed / Pending / Unlisted / Rejected / Review)
 *     -> Applications (Pending / Approved / Rejected, fully filled out)
 *       -> Residents (approved applicants promoted to resident accounts; current + previous)
 *         -> Leases generated from approved applications, at EVERY pipeline stage
 *            (Manager review / Admin review / Resident signature pending /
 *             Manager signature pending / Signed)
 *           -> Payments (household charges) across Pending / Overdue / Paid,
 *              with varied amounts/dates and edge cases (overdue, partial)
 *             -> Finances: income ledger entries derived from PAID charges,
 *                plus expenses across categories/dates over the year.
 *
 * Everything is scoped to one manager, deterministically keyed (prefix
 * `seedwf_`), and UPSERTED so re-running updates instead of duplicating.
 *
 * The same axis-test Supabase DB backs the website and the iOS/Android
 * (Capacitor) apps, so this populates both.
 *
 * Usage:
 *   node --env-file=.env.test scripts/seed-demo-manager-workflow.mjs
 *   node --env-file=.env      scripts/seed-demo-manager-workflow.mjs   # if .env has axis-test creds
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role).
 *
 * Safe to re-run. Only touches rows owned by the target manager (and the
 * resident accounts it provisions). Does NOT touch other managers' data.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  assertTestProjectUrl,
  DEMO_WORKFLOW_RESIDENT_EMAILS,
} from "../tests/helpers/canonical-test-accounts.mjs";
import {
  ensureManagerStripeCustomer,
  getSeedStripeClient,
} from "../tests/helpers/ensure-stripe-test-customer.mjs";

// ---------------------------------------------------------------------------
// Config / env
// ---------------------------------------------------------------------------
const TARGET_EMAIL = (process.env.SEED_MANAGER_EMAIL || "manager@test.axis.local").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Auto-provisioned resident password (mirrors src/lib/auth/provision-approved-resident.ts).
const AUTO_RESIDENT_PASSWORD = "123Password$";
const PREFIX = "seedwf";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with:  node --env-file=.env.test scripts/seed-demo-manager-workflow.mjs");
  process.exit(1);
}
// Test accounts must never be created in any other project (esp. production).
assertTestProjectUrl(url);

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = getSeedStripeClient();

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const NOW = new Date();
const iso = (d) => d.toISOString();
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86400000);
const monthsAgo = (n) => new Date(NOW.getFullYear(), NOW.getMonth() - n, 15, 12, 0, 0);
const usd = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centsOf = (dollars) => Math.round(Number(dollars) * 100);
/** Stable UUID (v5-shaped) derived from a key string, so ledger/expense upserts are idempotent. */
function detUuid(key) {
  const h = crypto.createHash("sha1").update(`${PREFIX}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

let managerUserId = "";
let managerShort = "";
const key = (s) => `${PREFIX}_${managerShort}_${s}`;

async function main() {
  console.log(`\n=== Seeding end-to-end manager workflow for ${TARGET_EMAIL} ===\n`);

  managerUserId = await ensureManager();
  managerShort = managerUserId.slice(0, 8);
  console.log(`Manager user id: ${managerUserId} (${managerShort})`);

  await cleanupPriorInconsistentRows();

  const props = buildProperties();
  await seedProperties(props);

  const applicants = buildApplicants();
  await seedApplications(applicants);
  await provisionResidents(applicants);
  await seedLeases(applicants);
  await seedRecurringRent(applicants);

  const charges = buildCharges(applicants);
  await seedCharges(charges);
  await seedIncomeLedger(charges);
  await seedExpenses();
  await seedPromotions();

  await printSummary();
  console.log("\n=== Done. Sign in as", TARGET_EMAIL, "and open the manager portal. ===\n");
}

// ---------------------------------------------------------------------------
// 1. Manager account (auth user + profile + role + Pro tier)
// ---------------------------------------------------------------------------
async function ensureManager() {
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  let user = list.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL);

  if (!user) {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: process.env.SEED_MANAGER_PASSWORD || "Password123$",
      email_confirm: true,
      user_metadata: { role: "manager" },
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    user = created.user;
    console.log("Created manager auth user.");
  }

  const uid = user.id;
  const { data: existing } = await sb.from("profiles").select("manager_id").eq("id", uid).maybeSingle();
  const managerId = existing?.manager_id || `MGR-${uid.slice(0, 8).toUpperCase()}`;

  await must(
    sb.from("profiles").upsert(
      {
        id: uid,
        email: TARGET_EMAIL,
        role: "manager",
        manager_id: managerId,
        full_name: "Axis Demo Manager",
        application_approved: true,
      },
      { onConflict: "id" },
    ),
    "profiles(manager)",
  );
  await must(
    sb.from("profile_roles").upsert({ user_id: uid, role: "manager" }, { onConflict: "user_id,role" }),
    "profile_roles(manager)",
  );

  // Ensure a Pro/Business tier purchase so Residents / Leases / Finances sections
  // are unlocked. Skip if the manager already has an unexpired paid tier (the
  // manager_id column is uniquely constrained, so we must not insert a second).
  const { data: purchases } = await sb
    .from("manager_purchases")
    .select("id, tier")
    .eq("user_id", uid);
  const hasPaidTier = (purchases ?? []).some((p) => {
    const t = String(p.tier ?? "").toLowerCase();
    return t === "pro" || t === "business";
  });
  if (!hasPaidTier) {
    await must(
      sb.from("manager_purchases").upsert(
        {
          id: detUuid("purchase-pro"),
          email: TARGET_EMAIL,
          user_id: uid,
          manager_id: managerId,
          tier: "pro",
          billing: "portal",
          promo_code: "SEEDWF",
          stripe_checkout_session_id: `${PREFIX}_pro`,
          paid_at: iso(monthsAgo(6)),
        },
        { onConflict: "id" },
      ),
      "manager_purchases(pro)",
    );
    console.log("Ensured Pro tier for manager.");
  } else {
    console.log("Manager already on a paid tier — Residents/Leases/Finances unlocked.");
  }

  // Give the manager a REAL Stripe test customer + default test card (not a
  // hand-typed cus_test_* placeholder) so manager charges — e.g. applicant
  // screening (src/lib/screening/charge-manager.ts) — succeed in test mode.
  await ensureManagerStripeCustomer(stripe, sb, { email: TARGET_EMAIL, userId: uid });

  return uid;
}

// ---------------------------------------------------------------------------
// Cleanup: prior crewmate left f707ad54-owned charges/rent pointing at another
// manager's property (seedfd_303a1185_*). Remove those so this manager's portal
// is coherent. Only deletes rows owned by THIS manager.
// ---------------------------------------------------------------------------
async function cleanupPriorInconsistentRows() {
  for (const table of ["portal_household_charge_records", "portal_recurring_rent_profile_records"]) {
    const { data } = await sb.from(table).select("id, property_id").eq("manager_user_id", managerUserId);
    const orphanIds = (data ?? [])
      .filter((r) => typeof r.property_id === "string" && r.property_id.startsWith("seedfd_") && !r.property_id.startsWith(`${PREFIX}_`))
      .map((r) => r.id);
    if (orphanIds.length) {
      await must(sb.from(table).delete().in("id", orphanIds), `cleanup orphaned ${table} rows`);
      console.log(`Cleaned ${orphanIds.length} orphaned ${table} rows (foreign property).`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Properties across every status
// ---------------------------------------------------------------------------
function mockProperty(o) {
  return {
    id: o.id,
    title: o.title,
    tagline: o.tagline,
    address: o.address,
    zip: o.zip,
    neighborhood: o.neighborhood,
    beds: o.beds,
    baths: o.baths,
    rentLabel: o.rentLabel,
    available: o.available ?? "Now",
    petFriendly: o.petFriendly ?? true,
    buildingId: `${o.id}-bld`,
    buildingName: o.title,
    unitLabel: o.unitLabel,
    managerUserId,
    adminPublishLive: o.adminPublishLive ?? true,
  };
}

function buildProperties() {
  const listed = [
    { id: key("prop-magnolia"), title: "Magnolia House — 5 rooms", tagline: "Furnished shared house, flexible terms.", address: "1420 Magnolia Ave, Seattle, WA", zip: "98122", neighborhood: "Capitol Hill", beds: 5, baths: 2, rentLabel: "$1,050–$1,300 / mo", unitLabel: "5 rooms" },
    { id: key("prop-birch"), title: "Birch Court — 4 rooms", tagline: "Bright rooms near the water and transit.", address: "812 Birch St, Seattle, WA", zip: "98107", neighborhood: "Ballard", beds: 4, baths: 2, rentLabel: "$1,100–$1,250 / mo", unitLabel: "4 rooms" },
    { id: key("prop-cedar"), title: "Cedar Flat 2B", tagline: "Modern 2-bed near the canal.", address: "455 Cedar Way, Seattle, WA", zip: "98103", neighborhood: "Fremont", beds: 2, baths: 1, rentLabel: "$2,400 / mo", unitLabel: "Unit 2B" },
  ];
  const review = [
    { id: key("prop-fir"), title: "Fir Loft 3", tagline: "Loft with skyline views — pending admin review.", address: "77 Fir Loft Rd, Seattle, WA", zip: "98109", neighborhood: "South Lake Union", beds: 1, baths: 1, rentLabel: "$2,100 / mo", unitLabel: "Loft 3" },
  ];
  const pending = [
    { id: key("prop-alder"), buildingName: "Alder Row — 3 rooms", address: "230 Alder Row, Seattle, WA", zip: "98144", neighborhood: "Beacon Hill", unitLabel: "3 rooms", beds: 3, baths: 1, monthlyRent: 1150, tagline: "New submission awaiting review." },
    { id: key("prop-spruce"), buildingName: "Spruce Studio", address: "9 Spruce Ln, Seattle, WA", zip: "98119", neighborhood: "Queen Anne", unitLabel: "Studio", beds: 0, baths: 1, monthlyRent: 1750, tagline: "Studio submission, docs pending." },
  ];
  const unlisted = [
    { adminRefId: key("prop-willow"), buildingName: "Willow House 1A", unitLabel: "Unit 1A", address: "612 Willow Ct, Seattle, WA", zip: "98105", neighborhood: "U-District", beds: 3, baths: 1, monthlyRent: 2200, petFriendly: false, tagline: "Temporarily unlisted for renovation." },
  ];
  const rejected = [
    { adminRefId: key("prop-elm"), buildingName: "Elm Basement", unitLabel: "Basement", address: "18 Elm St, Seattle, WA", zip: "98136", neighborhood: "West Seattle", beds: 1, baths: 1, monthlyRent: 900, petFriendly: false, tagline: "Rejected — egress requirements not met.", editRequestNote: "Bedroom egress window does not meet code; cannot list." },
  ];
  return { listed, review, pending, unlisted, rejected };
}

async function seedProperties({ listed, review, pending, unlisted, rejected }) {
  const rows = [];
  for (const p of listed) rows.push(propRecord(p.id, "live", { property_data: mockProperty(p) }));
  for (const p of review) rows.push(propRecord(p.id, "review", { property_data: mockProperty({ ...p, adminPublishLive: false }) }));
  for (const p of pending)
    rows.push(
      propRecord(p.id, "pending", {
        row_data: {
          id: p.id,
          submittedAt: iso(daysFromNow(-3)),
          buildingName: p.buildingName,
          address: p.address,
          zip: p.zip,
          neighborhood: p.neighborhood,
          unitLabel: p.unitLabel,
          beds: p.beds,
          baths: p.baths,
          monthlyRent: p.monthlyRent,
          petFriendly: true,
          tagline: p.tagline,
          submittedByUserId: managerUserId,
        },
      }),
    );
  for (const p of unlisted) rows.push(propRecord(p.adminRefId, "unlisted", { row_data: adminRow(p) }));
  for (const p of rejected)
    rows.push(propRecord(p.adminRefId, "rejected", { row_data: adminRow(p), edit_request_note: p.editRequestNote ?? null }));

  await must(sb.from("manager_property_records").upsert(rows, { onConflict: "id" }), "manager_property_records");
  console.log(`Seeded ${rows.length} properties (listed/review/pending/unlisted/rejected).`);
}

function adminRow(p) {
  return {
    adminRefId: p.adminRefId,
    buildingName: p.buildingName,
    unitLabel: p.unitLabel,
    address: p.address,
    zip: p.zip,
    neighborhood: p.neighborhood,
    beds: p.beds,
    baths: p.baths,
    monthlyRent: p.monthlyRent,
    petFriendly: p.petFriendly ?? true,
    tagline: p.tagline,
    listingId: p.adminRefId,
    managerUserId,
    ...(p.editRequestNote ? { editRequestNote: p.editRequestNote } : {}),
  };
}

function propRecord(id, status, extra) {
  return {
    id,
    manager_user_id: managerUserId,
    status,
    row_data: extra.row_data ?? null,
    property_data: extra.property_data ?? null,
    edit_request_note: extra.edit_request_note ?? null,
    updated_at: iso(NOW),
  };
}

// ---------------------------------------------------------------------------
// 3. Applications (fully filled) + applicant registry that drives residents,
//    leases and charges. `leaseStage` null = no lease (pending/rejected apps).
// ---------------------------------------------------------------------------
const MAGNOLIA = () => key("prop-magnolia");
const BIRCH = () => key("prop-birch");

function buildApplicants() {
  // Approved current residents, one per lease pipeline stage (+ extras Signed)
  const approvedCurrent = [
    { first: "Maya", last: "Chen", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 1", rent: 1300, leaseStage: "manager", income: 96000 },
    { first: "Liam", last: "Novak", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 2", rent: 1250, leaseStage: "admin", income: 88000 },
    { first: "Ava", last: "Rossi", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 3", rent: 1200, leaseStage: "resident_sign", income: 82000 },
    { first: "Noah", last: "Park", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 4", rent: 1150, leaseStage: "manager_sign", income: 79000 },
    { first: "Sofia", last: "Diaz", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 5", rent: 1300, leaseStage: "signed", income: 104000, activeRent: true },
    { first: "Diego", last: "Morales", propId: BIRCH, propLabel: "Birch Court — 4 rooms", room: "Room 1", rent: 1250, leaseStage: "signed", income: 91000, activeRent: true },
  ];
  // Approved but moved out -> Residents "Previous" tab
  const approvedPrevious = [
    { first: "Grace", last: "Hall", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 2", rent: 1200, leaseStage: "signed", income: 76000, previous: true, movedOutMonthsAgo: 3 },
    { first: "Owen", last: "Bennett", propId: BIRCH, propLabel: "Birch Court — 4 rooms", room: "Room 2", rent: 1150, leaseStage: "signed", income: 70000, previous: true, movedOutMonthsAgo: 5 },
  ];
  // `screen: "consider"` = completed Checkr report that did NOT auto-pass, so
  // the Screening section shows a mix of passed vs needs-manual-review.
  const pending = [
    { first: "Ethan", last: "Wright", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 2", rent: 1250, income: 71000, screen: "consider" },
    { first: "Olivia", last: "Brooks", propId: BIRCH, propLabel: "Birch Court — 4 rooms", room: "Room 3", rent: 1200, income: 68000 },
    { first: "Isabella", last: "Nguyen", propId: () => key("prop-cedar"), propLabel: "Cedar Flat 2B", room: "Unit 2B", rent: 2400, income: 120000 },
    { first: "Mason", last: "Clark", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 4", rent: 1150, income: 64000, screen: "consider" },
  ].map((a) => ({ ...a, bucket: "pending" }));
  const rejected = [
    { first: "Lucas", last: "Kim", propId: MAGNOLIA, propLabel: "Magnolia House — 5 rooms", room: "Room 3", rent: 1200, income: 40000, rejectReason: "Income below 2.5x rent.", screen: "consider" },
    { first: "Chloe", last: "Adams", propId: BIRCH, propLabel: "Birch Court — 4 rooms", room: "Room 4", rent: 1150, income: 0, rejectReason: "Incomplete application / no income docs." },
  ].map((a) => ({ ...a, bucket: "rejected" }));

  const all = [
    ...approvedCurrent.map((a) => ({ ...a, bucket: "approved" })),
    ...approvedPrevious.map((a) => ({ ...a, bucket: "approved" })),
    ...pending,
    ...rejected,
  ];

  // Derive stable ids, emails, and the full application object.
  const derived = all.map((a, i) => {
    const name = `${a.first} ${a.last}`;
    const email = `${a.first}.${a.last}.seed@example.com`.toLowerCase();
    const axisId = `AXIS-SEEDWF${managerShort.toUpperCase()}${String(i + 1).padStart(2, "0")}${a.last.toUpperCase().slice(0, 4)}`;
    return { ...a, index: i, name, email, axisId, application: buildApplication(a, name, email) };
  });
  // The E2E seed (tests/helpers/seed-test-db.mjs) prunes accounts not in the
  // shared canonical registry — an applicant missing there would have their
  // resident account deleted on the next E2E seed run.
  const unknown = derived.filter((a) => !DEMO_WORKFLOW_RESIDENT_EMAILS.includes(a.email));
  if (unknown.length) {
    throw new Error(
      `Applicants missing from tests/helpers/canonical-test-accounts.mjs: ${unknown.map((a) => a.email).join(", ")} — add them there.`,
    );
  }
  return derived;
}

function buildApplication(a, name, email) {
  const propId = a.propId();
  const leaseStart = isoDate(daysFromNow(a.previous ? -300 : 10));
  const leaseEnd = isoDate(daysFromNow(a.previous ? -30 : 375));
  return {
    ssn: "000-00-0000",
    pets: "None",
    email,
    phone: "(206) 555-0" + String(100 + a.index).padStart(3, "0"),
    groupId: "",
    prevZip: "98115",
    employer: "Northwest Tech Co.",
    jobTitle: "Analyst",
    leaseEnd,
    prevCity: "Seattle",
    ref1Name: "Priya Nair",
    ref2Name: "Marcus Lee",
    groupRole: null,
    groupSize: "",
    leaseTerm: "12 months",
    prevState: "WA",
    ref1Phone: "(206) 555-0166",
    ref2Phone: "(206) 555-0188",
    currentZip: "98122",
    dateSigned: isoDate(daysFromNow(-2)),
    leaseStart,
    prevMoveIn: "2021-01-15",
    prevStreet: "4102 Oak Glen Dr",
    propertyId: propId,
    rentalType: "standard",
    currentCity: "Seattle",
    dateOfBirth: "1995-05-14",
    hasCosigner: "no",
    notEmployed: a.income === 0,
    otherIncome: "",
    prevMoveOut: "2023-05-30",
    roomChoice1: a.room,
    roomChoice2: "",
    roomChoice3: "",
    annualIncome: String(a.income),
    consentTruth: true,
    currentState: "WA",
    consentCredit: true,
    currentMoveIn: "2023-06-01",
    currentStreet: "88 Maple Court",
    fullLegalName: name,
    monthlyIncome: String(Math.round(a.income / 12)),
    currentMoveOut: "",
    driversLicense: "WA-DL-4821990",
    occupancyCount: "1",
    supervisorName: "Dana Wells",
    applyingAsGroup: "no",
    criminalDetails: "",
    criminalHistory: "no",
    employerAddress: "500 Union St, Seattle, WA",
    employmentStart: "2022-03-01",
    evictionDetails: "",
    evictionHistory: "no",
    supervisorPhone: "(206) 555-0133",
    digitalSignature: name,
    prevLandlordName: "Sunset Property Mgmt",
    ref1Relationship: "Former colleague",
    ref2Relationship: "Friend",
    __signedRentLabel: `${usd(a.rent)} / month`,
    bankruptcyDetails: "",
    bankruptcyHistory: "no",
    noPreviousAddress: false,
    prevLandlordPhone: "(206) 555-0177",
    prevReasonLeaving: "Lease ended",
    currentLandlordName: "Cedar Property Mgmt",
    managerRentOverride: String(a.rent),
    currentLandlordPhone: "(206) 555-0190",
    currentReasonLeaving: "Relocating closer to work",
    shortTermCheckInTime: "",
    managerOtherCostLabel: "",
    shortTermCheckOutTime: "",
    managerOtherCostAmount: "",
    applicationFeePayChannel: "stripe",
    managerMoveInFeeOverride: "",
    managerUtilitiesOverride: "150",
    applicationFeeAcknowledged: true,
    managerSecurityDepositOverride: String(a.rent),
    applicationFeeZelleSentConfirmed: false,
  };
}

function stageLabelForApplicant(a) {
  if (a.bucket === "approved") {
    if (a.previous) return "moved out";
    return "Approved - placed";
  }
  if (a.bucket === "rejected") return "Rejected";
  return "Submitted";
}

/**
 * Completed (simulated) Checkr report, persisted the same way
 * runBackgroundCheck does (src/lib/checkr/background-check.ts): "consider"
 * maps to the "flagged" badge and demos the manual screening flow; everyone
 * else is "clear"/passed. Stable ids keep re-runs idempotent.
 */
function buildBackgroundCheck(a) {
  const consider = a.screen === "consider";
  return {
    provider: "checkr",
    candidateId: `seed-cand-${a.axisId.toLowerCase()}`,
    reportId: `seed-report-${a.axisId.toLowerCase()}`,
    packageSlug: "test_pro_criminal",
    status: "complete",
    result: consider ? "consider" : "clear",
    assessment: consider ? "review" : "eligible",
    orderedAt: iso(daysFromNow(-2)),
    completedAt: iso(daysFromNow(-1)),
    simulated: true,
  };
}

async function seedApplications(applicants) {
  const rows = applicants.map((a) => {
    const propId = a.propId();
    const approved = a.bucket === "approved";
    const backgroundCheck = buildBackgroundCheck(a);
    const rowData = {
      id: a.axisId,
      name: a.name,
      email: a.email,
      property: a.propLabel,
      stage: stageLabelForApplicant(a),
      bucket: a.bucket,
      detail:
        a.bucket === "approved"
          ? a.previous
            ? `Moved out ${isoDate(monthsAgo(a.movedOutMonthsAgo))}`
            : `Approved for ${a.room}`
          : a.bucket === "rejected"
            ? a.rejectReason || "Rejected"
            : `Submitted ${isoDate(daysFromNow(-1))}`,
      application: a.application,
      backgroundCheck,
      backgroundCheckStatus: backgroundCheck.result === "clear" ? "passed" : "flagged",
      propertyId: propId,
      assignedPropertyId: approved ? propId : undefined,
      assignedRoomChoice: approved ? a.room : undefined,
      signedMonthlyRent: approved ? a.rent : null,
      managerUserId,
      ...(a.previous
        ? { manualResidentDetails: { moveInDate: isoDate(daysFromNow(-300)), moveOutDate: isoDate(monthsAgo(a.movedOutMonthsAgo)), roomNumber: a.room, monthlyUtilities: 150, securityDeposit: a.rent, leaseTerm: "12 months" } }
        : {}),
    };
    return {
      id: a.axisId,
      manager_user_id: managerUserId,
      resident_email: a.email,
      property_id: propId,
      assigned_property_id: approved ? propId : null,
      row_data: rowData,
      updated_at: iso(NOW),
    };
  });
  await must(sb.from("manager_application_records").upsert(rows, { onConflict: "id" }), "manager_application_records");
  const by = (b) => applicants.filter((a) => a.bucket === b).length;
  console.log(`Seeded ${rows.length} applications (approved=${by("approved")}, pending=${by("pending")}, rejected=${by("rejected")}).`);
}

// ---------------------------------------------------------------------------
// 4. Residents: promote approved applicants to resident accounts
//    (auth user + profiles + profile_roles), mirroring provisionApprovedResidentAccount.
// ---------------------------------------------------------------------------
async function provisionResidents(applicants) {
  const approved = applicants.filter((a) => a.bucket === "approved");
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((list?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

  for (const a of approved) {
    let user = byEmail.get(a.email);
    if (!user) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email: a.email,
        password: AUTO_RESIDENT_PASSWORD,
        email_confirm: true,
        user_metadata: { role: "resident", axis_id: a.axisId, auto_provisioned_resident: true },
      });
      if (error) {
        console.warn(`  ! createUser(${a.email}): ${error.message}`);
        continue;
      }
      user = created.user;
    }
    a.residentUserId = user.id;
    await must(
      sb.from("profiles").upsert(
        {
          id: user.id,
          email: a.email,
          role: "resident",
          manager_id: a.axisId,
          full_name: a.name,
          application_approved: true,
        },
        { onConflict: "id" },
      ),
      `profiles(${a.email})`,
    );
    await must(
      sb.from("profile_roles").upsert({ user_id: user.id, role: "resident" }, { onConflict: "user_id,role" }),
      `profile_roles(${a.email})`,
    );
  }
  console.log(`Provisioned ${approved.length} resident accounts (password "${AUTO_RESIDENT_PASSWORD}").`);
}

// ---------------------------------------------------------------------------
// 5. Leases generated from approved applications, at each pipeline stage.
// ---------------------------------------------------------------------------
const LEASE_HTML = (name, unit, rent) =>
  `<section class="lease-doc"><h1>Residential Lease Agreement</h1>` +
  `<p><strong>Tenant:</strong> ${name}</p><p><strong>Premises:</strong> ${unit}</p>` +
  `<p><strong>Monthly Rent:</strong> ${usd(rent)}</p><p><strong>Term:</strong> 12 months</p>` +
  `<p>This agreement is generated from the approved rental application and governed by Washington State (Seattle) law.</p></section>`;

function buildLeaseRow(a) {
  const stage = a.leaseStage;
  const unit = `${a.propLabel} · ${a.room}`;
  const genIso = iso(daysFromNow(-4));
  const sentIso = iso(daysFromNow(-3));
  const resSignIso = iso(daysFromNow(-2));
  const mgrSignIso = iso(daysFromNow(-1));

  // Base row (from approved application).
  const row = {
    id: `${PREFIX}_${managerShort}_lease-${a.first.toLowerCase()}`,
    residentName: a.name,
    residentEmail: a.email,
    unit,
    updated: "just now",
    pdfVersion: 2,
    versionNumber: 2,
    notes: "Created from approved application.",
    updatedAtIso: iso(NOW),
    axisId: a.axisId,
    propertyId: a.propId(),
    managerUserId,
    residentUserId: a.residentUserId ?? null,
    roomChoice: a.room,
    signedRentLabel: `${usd(a.rent)} / month`,
    application: a.application,
    generatedHtml: LEASE_HTML(a.name, unit, a.rent),
    generatedAtIso: genIso,
    managerUploadedPdf: null,
    thread: [],
    managerSignature: null,
    residentSignature: null,
    signatureName: null,
    signedAtIso: null,
    residentSignedAt: null,
    managerSignedAt: null,
    adminReviewRequestedAt: null,
    sentToResidentAt: null,
    fullySignedAt: null,
    voidedAt: null,
    bucket: "manager",
    status: "Manager Review",
    stageLabel: "Manager Review",
    currentActorRole: "manager",
  };

  if (stage === "manager") {
    return row; // Manager Review
  }
  if (stage === "admin") {
    return { ...row, bucket: "admin", status: "Admin Review", stageLabel: "Admin Review", currentActorRole: "admin", adminReviewRequestedAt: sentIso };
  }
  if (stage === "resident_sign") {
    return { ...row, bucket: "resident", status: "Resident Signature Pending", stageLabel: "Resident Signature Pending", currentActorRole: "resident", sentToResidentAt: sentIso };
  }
  const resSig = { name: a.name, signedAtIso: resSignIso, role: "resident" };
  if (stage === "manager_sign") {
    return {
      ...row,
      bucket: "signed",
      status: "Manager Signature Pending",
      stageLabel: "Manager Signature Pending",
      currentActorRole: "manager",
      sentToResidentAt: sentIso,
      residentSignature: resSig,
      signatureName: a.name,
      signedAtIso: resSignIso,
      residentSignedAt: resSignIso,
    };
  }
  // signed (Fully Signed)
  return {
    ...row,
    bucket: "signed",
    status: "Fully Signed",
    stageLabel: "Signed",
    currentActorRole: "system",
    updated: a.previous ? isoDate(monthsAgo(a.movedOutMonthsAgo)) : "just now",
    sentToResidentAt: sentIso,
    residentSignature: resSig,
    managerSignature: { name: "Axis Demo Manager", signedAtIso: mgrSignIso, role: "manager" },
    signatureName: a.name,
    signedAtIso: resSignIso,
    residentSignedAt: resSignIso,
    managerSignedAt: mgrSignIso,
    fullySignedAt: mgrSignIso,
  };
}

async function seedLeases(applicants) {
  const leaseApplicants = applicants.filter((a) => a.bucket === "approved" && a.leaseStage);
  const rows = leaseApplicants.map((a) => {
    const row = buildLeaseRow(a);
    return {
      id: row.id,
      manager_user_id: managerUserId,
      resident_user_id: row.residentUserId,
      resident_email: row.residentEmail,
      property_id: row.propertyId,
      status: row.bucket,
      row_data: row,
      updated_at: iso(NOW),
    };
  });
  await must(sb.from("portal_lease_pipeline_records").upsert(rows, { onConflict: "id" }), "portal_lease_pipeline_records");
  const stageCounts = leaseApplicants.reduce((m, a) => ((m[a.leaseStage] = (m[a.leaseStage] || 0) + 1), m), {});
  console.log(`Seeded ${rows.length} leases across stages: ${JSON.stringify(stageCounts)}.`);
}

// ---------------------------------------------------------------------------
// 6. Recurring rent profiles (active for current signed residents; inactive for previous)
// ---------------------------------------------------------------------------
async function seedRecurringRent(applicants) {
  const withRent = applicants.filter((a) => a.bucket === "approved" && (a.activeRent || a.previous));
  const rows = withRent.map((a) => {
    const id = `${PREFIX}_${managerShort}_rent-${a.first.toLowerCase()}`;
    const active = Boolean(a.activeRent);
    return {
      id,
      manager_user_id: managerUserId,
      resident_user_id: a.residentUserId ?? null,
      resident_email: a.email,
      property_id: a.propId(),
      active,
      row_data: {
        id,
        active,
        dueDay: 1,
        roomLabel: a.room,
        updatedAt: iso(NOW),
        propertyId: a.propId(),
        startMonth: isoDate(a.previous ? monthsAgo(12) : monthsAgo(5)).slice(0, 7),
        monthlyRent: a.rent,
        residentName: a.name,
        managerUserId,
        propertyLabel: a.propLabel,
        residentEmail: a.email,
        residentUserId: a.residentUserId ?? null,
        monthlyUtilities: 150,
      },
      updated_at: iso(NOW),
    };
  });
  if (rows.length)
    await must(sb.from("portal_recurring_rent_profile_records").upsert(rows, { onConflict: "id" }), "portal_recurring_rent_profile_records");
  console.log(`Seeded ${rows.length} recurring rent profiles.`);
}

// ---------------------------------------------------------------------------
// 7. Payments (household charges) across Pending / Overdue / Paid + edge cases
// ---------------------------------------------------------------------------
function charge(a, o) {
  const id = `${PREFIX}_${managerShort}_hc-${a.first.toLowerCase()}-${o.slug}`;
  const status = o.paid ? "paid" : "pending";
  const balance = o.paid ? 0 : o.balance ?? o.amount;
  return {
    id,
    manager_user_id: managerUserId,
    resident_user_id: a.residentUserId ?? null,
    resident_email: a.email,
    property_id: a.propId(),
    kind: o.kind,
    status,
    row_data: {
      id,
      kind: o.kind,
      title: o.title,
      status,
      createdAt: iso(o.createdAt),
      ...(o.paid ? { paidAt: iso(o.paidAt ?? o.createdAt) } : {}),
      propertyId: a.propId(),
      amountLabel: usd(o.amount),
      balanceLabel: usd(balance),
      dueDateLabel: isoDate(o.due),
      residentName: a.name,
      residentEmail: a.email,
      residentUserId: a.residentUserId ?? null,
      managerUserId,
      propertyLabel: a.propLabel,
      applicationId: a.axisId,
      blocksLeaseUntilPaid: false,
      axisPaymentsEnabledSnapshot: true,
    },
    updated_at: iso(NOW),
  };
}

function buildCharges(applicants) {
  const charges = [];
  const approved = applicants.filter((a) => a.bucket === "approved");

  for (const a of approved) {
    const dep = Math.round(a.rent);
    // Onboarding fees (paid app fee; deposit pending before signing)
    charges.push(charge(a, { slug: "appfee", kind: "application_fee", title: "Application fee", amount: 50, paid: true, createdAt: daysFromNow(-40), paidAt: daysFromNow(-39), due: daysFromNow(-40) }));

    if (a.activeRent || a.previous) {
      // Deposit paid, several months of paid rent history -> income across the range
      charges.push(charge(a, { slug: "deposit", kind: "security_deposit", title: "Security deposit", amount: dep, paid: true, createdAt: monthsAgo(6), paidAt: monthsAgo(6), due: monthsAgo(6) }));
      const historyMonths = a.previous ? [8, 7, 6, 5, 4] : [5, 4, 3, 2, 1];
      for (const m of historyMonths) {
        charges.push(charge(a, { slug: `rent-${m}`, kind: "rent", title: `Rent — ${isoDate(monthsAgo(m)).slice(0, 7)}`, amount: a.rent, paid: true, createdAt: monthsAgo(m), paidAt: monthsAgo(m), due: monthsAgo(m) }));
      }
    } else {
      // Not-yet-signed onboarding residents: deposit pending (edge: due soon)
      charges.push(charge(a, { slug: "deposit", kind: "security_deposit", title: "Security deposit", amount: dep, paid: false, createdAt: daysFromNow(-5), due: daysFromNow(3) }));
    }
  }

  // Current-cycle charges for active residents: Pending (due soon), Overdue, Partial
  const current = approved.filter((a) => a.activeRent);
  if (current[0]) {
    const a = current[0]; // Sofia — pending rent due within 7 days
    charges.push(charge(a, { slug: "rent-current", kind: "rent", title: `Rent — ${isoDate(NOW).slice(0, 7)}`, amount: a.rent, paid: false, createdAt: daysFromNow(-2), due: daysFromNow(4) }));
    charges.push(charge(a, { slug: "util-current", kind: "utilities", title: "Utilities — current month", amount: 150, paid: false, createdAt: daysFromNow(-1), due: daysFromNow(6) }));
  }
  if (current[1]) {
    const a = current[1]; // Diego — overdue rent + partial utilities (edge cases)
    charges.push(charge(a, { slug: "rent-overdue", kind: "rent", title: `Rent — ${isoDate(monthsAgo(0)).slice(0, 7)} (late)`, amount: a.rent, paid: false, createdAt: daysFromNow(-20), due: daysFromNow(-12) }));
    charges.push(charge(a, { slug: "late-fee", kind: "late_fee", title: "Late fee", amount: 75, paid: false, createdAt: daysFromNow(-11), due: daysFromNow(-11) }));
    // Partial: billed 150, 90 still due
    charges.push(charge(a, { slug: "util-partial", kind: "utilities", title: "Utilities — partial payment", amount: 150, balance: 90, paid: false, createdAt: daysFromNow(-6), due: daysFromNow(2) }));
  }
  return charges;
}

async function seedCharges(charges) {
  await must(sb.from("portal_household_charge_records").upsert(charges, { onConflict: "id" }), "portal_household_charge_records");
  const paid = charges.filter((c) => c.status === "paid").length;
  console.log(`Seeded ${charges.length} household charges (paid=${paid}, unpaid=${charges.length - paid}).`);
}

// ---------------------------------------------------------------------------
// 8. Finances: income ledger entries derived from PAID charges (+ their charge rows)
// ---------------------------------------------------------------------------
const KIND_TO_CATEGORY = {
  rent: "rent_income",
  first_month_rent: "rent_income",
  prorated_rent: "rent_income",
  prorated_last_month_rent: "rent_income",
  late_fee: "late_fees",
  application_fee: "application_fee",
  utilities: "other_income",
  security_deposit: "other_income",
  move_in_fee: "other_income",
};
const catForKind = (k) => KIND_TO_CATEGORY[k] || "other_income";

async function seedIncomeLedger(charges) {
  // Idempotent: clear this seed's ledger rows first (keyed by our source_charge_id prefix).
  await must(
    sb.from("ledger_entries").delete().eq("manager_user_id", managerUserId).like("source_charge_id", `${PREFIX}_%`),
    "clear prior seeded ledger entries",
  );

  const rows = [];
  for (const c of charges) {
    const d = c.row_data;
    const cents = centsOf(d.amountLabel.replace(/[^0-9.]/g, ""));
    if (cents <= 0) continue;
    const base = {
      manager_user_id: managerUserId,
      resident_user_id: c.resident_user_id,
      resident_email: c.resident_email,
      property_id: c.property_id,
      unit_label: d.propertyLabel,
      lease_id: d.applicationId ?? null,
      category_code: catForKind(c.kind),
      amount_cents: cents,
      due_date: d.dueDateLabel,
      source_charge_id: c.id,
      updated_at: iso(NOW),
    };
    // charge entry (mirrors backfill)
    rows.push({ id: detUuid(`ledger-charge-${c.id}`), ...base, entry_type: "charge", posted_date: isoDate(new Date(d.createdAt)), description: d.title });
    // payment entry (income) only for paid charges
    if (c.status === "paid") {
      rows.push({ id: detUuid(`ledger-payment-${c.id}`), ...base, entry_type: "payment", posted_date: isoDate(new Date(d.paidAt ?? d.createdAt)), description: `Payment — ${d.title}` });
    }
  }
  if (rows.length) await must(sb.from("ledger_entries").upsert(rows, { onConflict: "id" }), "ledger_entries");
  const income = rows.filter((r) => r.entry_type === "payment").length;
  console.log(`Seeded ${rows.length} ledger entries (${income} income/payment rows from paid charges).`);
}

// ---------------------------------------------------------------------------
// 9. Expenses across categories and dates over the year
// ---------------------------------------------------------------------------
async function seedExpenses() {
  const specs = [
    { slug: "mnt-1", cat: "maintenance", amount: 480, months: 6, memo: "Roof gutter repair", vendor: "Cascade Handyman" },
    { slug: "plm-1", cat: "plumbing", amount: 320, months: 5, memo: "Kitchen sink leak fix", vendor: "Rain City Plumbing" },
    { slug: "cln-1", cat: "cleaning", amount: 180, months: 5, memo: "Common-area deep clean", vendor: "SparkleWorks" },
    { slug: "utl-1", cat: "utilities", amount: 260, months: 4, memo: "Water/sewer — building", vendor: "Seattle Public Utilities" },
    { slug: "ins-1", cat: "insurance", amount: 1450, months: 4, memo: "Landlord policy — semiannual", vendor: "Puget Mutual" },
    { slug: "hvac-1", cat: "heating", amount: 540, months: 3, memo: "Furnace annual service", vendor: "Northwest HVAC" },
    { slug: "wifi-1", cat: "wifi", amount: 95, months: 3, memo: "Building internet", vendor: "Fiber NW" },
    { slug: "mgmt-1", cat: "management", amount: 300, months: 2, memo: "Property management fee", vendor: "Axis" },
    { slug: "mat-1", cat: "materials", amount: 210, months: 2, memo: "Paint + supplies", vendor: "Ballard Hardware" },
    { slug: "tax-1", cat: "property_tax", amount: 2200, months: 2, memo: "County property tax installment", vendor: "King County" },
    { slug: "cln-2", cat: "cleaning", amount: 165, months: 1, memo: "Turnover clean — Room 2", vendor: "SparkleWorks" },
    { slug: "mnt-2", cat: "maintenance", amount: 390, months: 1, memo: "Door + lock replacement", vendor: "Cascade Handyman" },
    { slug: "utl-2", cat: "electricity", amount: 175, months: 0, memo: "Common-area electricity", vendor: "Seattle City Light" },
  ];
  // Spread expenses across the two main listed properties.
  const propA = key("prop-magnolia");
  const propB = key("prop-birch");
  const rows = specs.map((s, i) => ({
    id: detUuid(`expense-${s.slug}`),
    manager_user_id: managerUserId,
    property_id: i % 3 === 0 ? propB : propA,
    category_code: s.cat,
    amount_cents: centsOf(s.amount),
    expense_date: isoDate(monthsAgo(s.months)),
    memo: s.memo,
    vendor_id: s.vendor,
    updated_at: iso(NOW),
  }));
  await must(sb.from("manager_expense_entries").upsert(rows, { onConflict: "id" }), "manager_expense_entries");
  console.log(`Seeded ${rows.length} expense entries across categories.`);
}

// ---------------------------------------------------------------------------
// 8. Promotions (AI flyers) — a couple of generated flyers + one draft, so the
//    Promotion tab is populated for the test manager.
// ---------------------------------------------------------------------------
async function seedPromotions() {
  const mk = (slug, propKey, label, title, theme, status, inputs, copy, ageDays) => {
    const id = key(slug);
    const created = iso(daysFromNow(ageDays));
    return {
      id,
      manager_user_id: managerUserId,
      row_data: {
        id,
        managerUserId,
        propertyId: propKey ? key(propKey) : null,
        propertyLabel: label,
        title,
        theme,
        status,
        inputs,
        copy,
        createdAt: created,
        updatedAt: created,
      },
      updated_at: created,
    };
  };

  const rows = [
    mk(
      "promo-cedar",
      "prop-cedar",
      "Cedar Flat 2B — Fremont",
      "Fremont 2-bed feature",
      "cobalt",
      "generated",
      {
        headline: "Modern 2-bed near the canal",
        sellingPoints: "Modern finishes\nNear the canal\nWalk to transit",
        price: "$2,400 / mo",
        promo: "First month free",
        cta: "Book a tour today",
        contact: "leasing@axis.com · (206) 555-0142",
        tone: "Warm & welcoming",
      },
      {
        headline: "Modern Living by the Canal",
        subheadline: "Cedar Flat 2B — Fremont · $2,400 / mo",
        sellingPoints: ["Modern finishes throughout", "Steps from the canal", "Walk to transit"],
        promoLine: "First month free",
        ctaText: "Book a tour today",
        closingLine: "Contact us: leasing@axis.com · (206) 555-0142",
      },
      -6,
    ),
    mk(
      "promo-magnolia",
      "prop-magnolia",
      "Magnolia House — Capitol Hill",
      "Shared house rooms",
      "forest",
      "generated",
      {
        headline: "Furnished rooms, flexible terms",
        sellingPoints: "Furnished rooms\nFlexible terms\nUtilities included",
        price: "$1,050–$1,300 / mo",
        promo: "",
        cta: "Reserve a room",
        contact: "leasing@axis.com",
        tone: "Calm & professional",
      },
      {
        headline: "Furnished Rooms on Capitol Hill",
        subheadline: "Magnolia House — Capitol Hill · $1,050–$1,300 / mo",
        sellingPoints: ["Fully furnished rooms", "Flexible lease terms", "Utilities included"],
        promoLine: "",
        ctaText: "Reserve a room",
        closingLine: "Contact us: leasing@axis.com",
      },
      -2,
    ),
    mk(
      "promo-birch-draft",
      "prop-birch",
      "Birch Court — Ballard",
      "Ballard rooms (draft)",
      "sunset",
      "draft",
      {
        headline: "Bright rooms near the water",
        sellingPoints: "Bright rooms\nNear the water\nClose to transit",
        price: "$1,100–$1,250 / mo",
        promo: "$250 off first month",
        cta: "Apply online",
        contact: "leasing@axis.com",
        tone: "Bold & energetic",
      },
      null,
      0,
    ),
  ];

  await must(sb.from("manager_promotion_records").upsert(rows, { onConflict: "id" }), "manager_promotion_records");
  console.log(`Seeded ${rows.length} promotions (generated + draft).`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
async function printSummary() {
  const counts = {};
  const q = async (t, extra) => {
    let query = sb.from(t).select("*", { count: "exact", head: true }).eq("manager_user_id", managerUserId);
    if (extra) query = extra(query);
    const { count } = await query;
    return count ?? 0;
  };
  counts.properties = await q("manager_property_records");
  counts.applications = await q("manager_application_records");
  counts.leases = await q("portal_lease_pipeline_records");
  counts.charges = await q("portal_household_charge_records");
  counts.recurringRent = await q("portal_recurring_rent_profile_records");
  counts.ledgerEntries = await q("ledger_entries");
  counts.expenses = await q("manager_expense_entries");
  counts.promotions = await q("manager_promotion_records");
  console.log("\nManager-scoped row counts:", JSON.stringify(counts, null, 2));
}

// ---------------------------------------------------------------------------
async function must(promise, label) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

main().catch((err) => {
  console.error("\nSEED FAILED:", err.message);
  process.exit(1);
});
