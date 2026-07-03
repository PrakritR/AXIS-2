#!/usr/bin/env node
/**
 * Seeds a dedicated Supabase test project with admin, manager, resident, and sample data.
 * Usage: node --env-file=.env.test tests/helpers/seed-test-db.mjs [testRunId]
 *
 * Every upsert is error-checked (`must`) so a schema mismatch fails the run loudly
 * instead of silently leaving the test accounts disconnected.
 *
 * Beyond the primary E2E manager/resident/property/charge, this seeds a coherent
 * browse catalog: every home the public browse/apply flow lists is a live
 * `manager_property_records` row OWNED by a test manager (manager@ / manager2@
 * test.axis.local), carries a full listingSubmission (v:1), and has at least one
 * application (manager_application_records) and one lease
 * (portal_lease_pipeline_records) in its pipeline — no orphaned properties.
 * Superseded rows from older seeds (seedwf_ / mgr- prefixes, ANY status) owned
 * by the test managers are deleted — a non-live row like a `review` loft still
 * reaches the Calendar property picker (propertyRowsToSnapshot puts review rows
 * in extras) while never reaching the Properties tab (which needs a `mgr-`
 * prefix), so leftovers make tabs disagree. Dependent rows that reference a
 * non-canonical property, calendar events pointing at missing properties, and
 * runtime drift on non-approved applicants are cleaned for the same reason:
 * every tab must show the same coherent catalog.
 *
 * Reference implementation for column names / row shapes:
 * scripts/seed-demo-manager-workflow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import {
  assertTestProjectUrl,
  DEMO_WORKFLOW_RESIDENT_EMAILS,
  PRODUCTION_ADMIN_EMAIL,
} from "./canonical-test-accounts.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testRunId = process.argv[2]?.trim() || `seed-${Date.now()}`;

const adminEmail = (process.env.E2E_ADMIN_EMAIL ?? "admin@test.axis.local").toLowerCase();
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "TestAdmin123!";
const managerEmail = (process.env.E2E_MANAGER_EMAIL ?? "manager@test.axis.local").toLowerCase();
const managerPassword = process.env.E2E_MANAGER_PASSWORD ?? "TestManager123!";
const residentEmail = (process.env.E2E_RESIDENT_EMAIL ?? "resident@test.axis.local").toLowerCase();
const residentPassword = process.env.E2E_RESIDENT_PASSWORD ?? "TestResident123!";
// Must match E2E_RESIDENT_AXIS_ID in tests/fixtures/index.ts. The application
// record id IS the resident's axis id (see normalizeApplicationAxisId), and the
// resident's `profiles.manager_id` stores the same axis id — that is where the
// app reads it (resident-portal-access.ts, resident-profile-panel.tsx).
const residentAxisId = process.env.E2E_RESIDENT_AXIS_ID ?? "AXIS-TESTRSID";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
// This seed both creates test accounts and PRUNES non-canonical ones — it must
// only ever touch the dedicated test project, and the production ops admin
// must never be part of the canonical test set.
assertTestProjectUrl(url);
for (const [label, email] of [
  ["E2E_ADMIN_EMAIL", adminEmail],
  ["E2E_MANAGER_EMAIL", managerEmail],
  ["E2E_RESIDENT_EMAIL", residentEmail],
]) {
  if (email === PRODUCTION_ADMIN_EMAIL) {
    console.error(`${label} is the production admin (${PRODUCTION_ADMIN_EMAIL}) — that account lives only in production.`);
    process.exit(1);
  }
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Throws when a Supabase mutation returned an error — no more silent seed failures. */
async function must(promise, label) {
  const { error, data } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

const NOW = new Date();
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86400000);

async function ensureUser(email, password, role, { managerId = null, metadata = {} } = {}) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, ...metadata },
  });

  let userId;
  if (createErr) {
    const exists = createErr.message.toLowerCase().includes("already");
    if (!exists) throw new Error(`createUser ${email}: ${createErr.message}`);
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw new Error(`listUsers: ${listErr.message}`);
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw new Error(`User ${email} exists but not found`);
    userId = existing.id;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { ...(existing.user_metadata ?? {}), role, ...metadata },
    });
    if (updateErr) throw new Error(`updateUserById ${email}: ${updateErr.message}`);
  } else {
    userId = created.user.id;
  }

  await must(
    supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        role,
        ...(managerId ? { manager_id: managerId } : {}),
        full_name: email.split("@")[0],
      },
      { onConflict: "id" },
    ),
    `profiles(${email})`,
  );

  await must(
    supabase.from("profile_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" }),
    `profile_roles(${email})`,
  );
  return userId;
}

try {
  const adminId = await ensureUser(adminEmail, adminPassword, "admin");

  // Stable manager business id: reuse the profile's existing id (or derive one from
  // the auth user id) so re-runs never mint a new MGR- id per testRunId — that used
  // to accumulate manager_purchases rows and orphan previously seeded records.
  const { data: managerList, error: managerListErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (managerListErr) throw new Error(`listUsers: ${managerListErr.message}`);
  const existingManagerUser = managerList?.users?.find((u) => u.email?.toLowerCase() === managerEmail);
  let managerId = `MGR-TESTE2E`;
  if (existingManagerUser) {
    const { data: managerProfile } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", existingManagerUser.id)
      .maybeSingle();
    if (managerProfile?.manager_id?.trim()) managerId = managerProfile.manager_id.trim();
  }
  const managerUserId = await ensureUser(managerEmail, managerPassword, "manager", { managerId });

  // Paid-tier purchase (FREE100 waiver = authorized paid access without Stripe; see
  // manager-tier-sync.ts) so tier-gated manager tabs (Financials/Documents/Services/
  // Promotion) and resident tabs gated on the manager's tier are never paywalled.
  const { data: purchases } = await supabase
    .from("manager_purchases")
    .select("id, tier")
    .eq("user_id", managerUserId);
  const hasPaidTier = (purchases ?? []).some((p) => {
    const t = String(p.tier ?? "").toLowerCase();
    return t === "pro" || t === "business";
  });
  if (!hasPaidTier) {
    await must(
      supabase.from("manager_purchases").upsert(
        {
          stripe_checkout_session_id: "seed_e2e",
          email: managerEmail,
          manager_id: managerId,
          tier: "pro",
          billing: "portal",
          user_id: managerUserId,
          promo_code: "FREE100",
          paid_at: NOW.toISOString(),
        },
        { onConflict: "manager_id" },
      ),
      "manager_purchases",
    );
  }

  // Stable id + upsert so repeated e2e runs reuse ONE well-formed record for the
  // shared demo manager instead of accumulating raw-id "Seed Property <ts>" rows.
  // property_data is a full MockProperty INCLUDING a listingSubmission (v:1) — the
  // lease generator (generated-lease.ts / build-lease-html.ts) reads rooms, fees,
  // shared spaces, house rules, and lease terms from it; without it generated
  // leases render "—" and "[ROOM NUMBER]" placeholders. Address stays in San
  // Francisco — a supported lease jurisdiction (lease-jurisdiction.ts).
  const propertyId = "mgr-test-e2e";
  const propertyName = "Test Property — E2E";
  const propertyAddress = "123 Test St, San Francisco, CA 94105";
  const monthlyRent = 2500;
  const listingSubmission = {
    v: 1,
    buildingName: propertyName,
    address: propertyAddress,
    zip: "94105",
    neighborhood: "SoMa",
    homeStructureNote: "3-story townhouse",
    listingPlaceCategoryId: "private_room",
    tagline: "Bright shared townhouse near downtown transit.",
    petFriendly: true,
    houseOverview:
      "A bright, fully furnished 3-room shared townhouse in SoMa with a modern kitchen, fast Wi-Fi, in-unit laundry, and a shared rooftop deck. Two blocks from Muni and Caltrain.",
    houseRulesText:
      "Quiet hours 10pm–8am. No smoking anywhere on the premises. Overnight guests limited to 3 nights per week. Clean shared spaces after use.",
    housePhotoDataUrls: [],
    allowedLeaseTerms: ["12 months"],
    leaseTermsBody: "Available lease lengths: 12 months.",
    applicationFee: "$50",
    securityDeposit: "$2,500",
    moveInFee: "$250",
    paymentAtSigningIncludes: ["security_deposit", "move_in_fee"],
    houseCostsDetail: "",
    parkingMonthly: "",
    hoaMonthly: "",
    otherMonthlyFees: "",
    sharedSpaces: [
      {
        id: "shared-kitchen",
        name: "Kitchen",
        location: "Main floor",
        detail: "Full kitchen with dishwasher, shared by all residents.",
        amenitiesText: "Refrigerator\nDishwasher\nGas range",
        photoDataUrls: [],
        videoDataUrl: null,
        roomAccessIds: ["room-1", "room-2", "room-3"],
      },
      {
        id: "shared-living",
        name: "Living room",
        location: "Main floor",
        detail: "Furnished living room with smart TV.",
        amenitiesText: "Sofa\nSmart TV",
        photoDataUrls: [],
        videoDataUrl: null,
        roomAccessIds: ["room-1", "room-2", "room-3"],
      },
    ],
    amenitiesText: "In-unit laundry\nFast Wi-Fi\nFurnished rooms\nRooftop deck",
    rooms: [
      {
        id: "room-1",
        name: "Room 1",
        floor: "2nd floor",
        monthlyRent,
        availability: "Now",
        moveInAvailableDate: isoDate(NOW),
        moveInInstructions: "Lockbox at front door; code shared after signing.",
        manualUnavailableRanges: [],
        detail: "Queen bed, desk, and closet; south-facing window.",
        furnishing: "Fully furnished",
        roomAmenitiesText: "Queen bed\nDesk\nCloset",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "$150",
        prorateMethod: "auto",
      },
      {
        id: "room-2",
        name: "Room 2",
        floor: "2nd floor",
        monthlyRent: 2400,
        availability: "Now",
        moveInAvailableDate: isoDate(NOW),
        moveInInstructions: "Lockbox at front door; code shared after signing.",
        manualUnavailableRanges: [],
        detail: "Full bed and desk; faces the courtyard.",
        furnishing: "Fully furnished",
        roomAmenitiesText: "Full bed\nDesk",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "$150",
        prorateMethod: "auto",
      },
      {
        id: "room-3",
        name: "Room 3",
        floor: "3rd floor",
        monthlyRent: 2300,
        availability: "Now",
        moveInAvailableDate: isoDate(NOW),
        moveInInstructions: "Lockbox at front door; code shared after signing.",
        manualUnavailableRanges: [],
        detail: "Cozy top-floor room with skylight.",
        furnishing: "Fully furnished",
        roomAmenitiesText: "Full bed\nSkylight",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "$150",
        prorateMethod: "auto",
      },
    ],
    bathrooms: [],
    bundles: [],
    quickFacts: [],
  };

  await must(
    supabase.from("manager_property_records").upsert(
      {
        id: propertyId,
        manager_user_id: managerUserId,
        status: "live",
        property_data: {
          id: propertyId,
          title: propertyName,
          tagline: listingSubmission.tagline,
          address: propertyAddress,
          zip: "94105",
          neighborhood: "SoMa",
          beds: 3,
          baths: 2,
          rentLabel: "$2,300–$2,500 / mo",
          available: "Now",
          petFriendly: true,
          buildingId: `${propertyId}-bld`,
          buildingName: propertyName,
          unitLabel: "3 rooms",
          managerUserId,
          adminPublishLive: true,
          listingSubmission,
        },
        row_data: {
          id: propertyId,
          status: "live",
          name: propertyName,
          buildingName: propertyName,
          address: propertyAddress,
          testRunId,
        },
      },
      { onConflict: "id" },
    ),
    "manager_property_records",
  );

  // ── Resident account ──────────────────────────────────────────────────────
  const residentUserId = await ensureUser(residentEmail, residentPassword, "resident", {
    metadata: { axis_id: residentAxisId },
  });

  // Approved application linking resident to manager (idempotent: stable id +
  // upsert). The record id is the resident's axis id — the app treats them as the
  // same value. Includes a full nested `application` (RentalWizardFormState) so
  // generated leases carry real names, income, references, dates, and fees.
  const roomChoice = `${propertyId}::room-1`; // "<propertyId>::<listingRoomId>" (parseRoomChoiceValue)
  const leaseStart = isoDate(daysFromNow(10));
  const leaseEnd = isoDate(daysFromNow(375));
  const application = {
    fullLegalName: "Test Resident",
    email: residentEmail,
    phone: "(415) 555-0134",
    dateOfBirth: "1996-04-18",
    ssn: "000-00-0000",
    driversLicense: "CA-DL-7738201",
    employer: "Bay Area Tech Co.",
    jobTitle: "Software Engineer",
    employerAddress: "500 Howard St, San Francisco, CA",
    employmentStart: "2022-02-01",
    supervisorName: "Dana Wells",
    supervisorPhone: "(415) 555-0133",
    monthlyIncome: "9500",
    annualIncome: "114000",
    notEmployed: false,
    otherIncome: "",
    occupancyCount: "1",
    pets: "None",
    currentStreet: "88 Maple Court",
    currentCity: "San Francisco",
    currentState: "CA",
    currentZip: "94110",
    currentMoveIn: "2023-06-01",
    currentMoveOut: "",
    currentLandlordName: "Mission Property Mgmt",
    currentLandlordPhone: "(415) 555-0190",
    currentReasonLeaving: "Relocating closer to work",
    noPreviousAddress: false,
    prevStreet: "4102 Oak Glen Dr",
    prevCity: "Oakland",
    prevState: "CA",
    prevZip: "94601",
    prevMoveIn: "2021-01-15",
    prevMoveOut: "2023-05-30",
    prevLandlordName: "Sunset Property Mgmt",
    prevLandlordPhone: "(510) 555-0177",
    prevReasonLeaving: "Lease ended",
    ref1Name: "Priya Nair",
    ref1Phone: "(415) 555-0166",
    ref1Relationship: "Former colleague",
    ref2Name: "Marcus Lee",
    ref2Phone: "(415) 555-0188",
    ref2Relationship: "Friend",
    criminalHistory: "no",
    criminalDetails: "",
    evictionHistory: "no",
    evictionDetails: "",
    bankruptcyHistory: "no",
    bankruptcyDetails: "",
    hasCosigner: "no",
    applyingAsGroup: "no",
    groupId: "",
    groupRole: null,
    groupSize: "",
    propertyId,
    rentalType: "standard",
    leaseTerm: "12 months",
    leaseStart,
    leaseEnd,
    roomChoice1: roomChoice,
    roomChoice2: "",
    roomChoice3: "",
    shortTermCheckInTime: "",
    shortTermCheckOutTime: "",
    managerRentOverride: String(monthlyRent),
    managerUtilitiesOverride: "150",
    managerSecurityDepositOverride: String(monthlyRent),
    managerMoveInFeeOverride: "250",
    managerOtherCostLabel: "",
    managerOtherCostAmount: "",
    __signedRentLabel: `$${monthlyRent.toFixed(2)} / month`,
    consentTruth: true,
    consentCredit: true,
    dateSigned: isoDate(daysFromNow(-2)),
    digitalSignature: "Test Resident",
    applicationFeePayChannel: "stripe",
    applicationFeeAcknowledged: true,
    applicationFeeZelleSentConfirmed: false,
  };

  // Remove the legacy record (pre-axis-id primary key) so the resident has ONE application.
  await must(supabase.from("manager_application_records").delete().eq("id", "test-app-e2e"), "delete legacy application");

  await must(
    supabase.from("manager_application_records").upsert(
      {
        id: residentAxisId,
        manager_user_id: managerUserId,
        resident_email: residentEmail,
        property_id: propertyId,
        assigned_property_id: propertyId,
        row_data: {
          id: residentAxisId,
          axisId: residentAxisId,
          bucket: "approved",
          stage: "Approved - placed",
          detail: "Approved for Room 1",
          email: residentEmail,
          name: "Test Resident",
          property: propertyName,
          application,
          backgroundCheck: {
            provider: "checkr",
            candidateId: `seed-cand-${residentAxisId.toLowerCase()}`,
            reportId: `seed-report-${residentAxisId.toLowerCase()}`,
            packageSlug: "test_pro_criminal",
            status: "complete",
            result: "clear",
            assessment: "eligible",
            orderedAt: daysFromNow(-2).toISOString(),
            completedAt: daysFromNow(-1).toISOString(),
            simulated: true,
          },
          backgroundCheckStatus: "passed",
          managerUserId,
          propertyId,
          assignedPropertyId: propertyId,
          assignedRoomChoice: roomChoice,
          signedMonthlyRent: monthlyRent,
          testRunId,
        },
      },
      { onConflict: "id" },
    ),
    "manager_application_records",
  );

  // Resident profile: manager_id holds the resident's axis id (the app's own
  // convention — provision-approved-resident.ts) and application_approved unlocks
  // the full resident portal.
  await must(
    supabase.from("profiles").upsert(
      {
        id: residentUserId,
        email: residentEmail,
        role: "resident",
        manager_id: residentAxisId,
        full_name: "Test Resident",
        application_approved: true,
      },
      { onConflict: "id" },
    ),
    "profiles(resident)",
  );

  // Household rent charge (idempotent: stable id + upsert). Columns + row_data
  // shape mirror seed-demo-manager-workflow.mjs / household-charges.ts.
  const chargeId = "test-charge-e2e";
  const rentMonthLabel = isoDate(NOW).slice(0, 7);
  await must(
    supabase.from("portal_household_charge_records").upsert(
      {
        id: chargeId,
        manager_user_id: managerUserId,
        resident_user_id: residentUserId,
        resident_email: residentEmail,
        property_id: propertyId,
        kind: "rent",
        status: "pending",
        row_data: {
          id: chargeId,
          kind: "rent",
          title: `Rent — ${rentMonthLabel}`,
          status: "pending",
          createdAt: NOW.toISOString(),
          propertyId,
          amountLabel: `$${monthlyRent.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          balanceLabel: `$${monthlyRent.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          // Within 7 days — pending charges further out are hidden by
          // shouldDisplayChargeInPayments (household-charges.ts).
          dueDateLabel: isoDate(daysFromNow(3)),
          residentName: "Test Resident",
          residentEmail,
          residentUserId,
          managerUserId,
          propertyLabel: propertyName,
          applicationId: residentAxisId,
          blocksLeaseUntilPaid: false,
          axisPaymentsEnabledSnapshot: true,
          testRunId,
        },
      },
      { onConflict: "id" },
    ),
    "portal_household_charge_records",
  );

  // Tour / schedule record for manager (idempotent: stable id + upsert).
  const tourId = "test-tour-e2e";
  const tourStart = daysFromNow(7).toISOString();
  const tourEnd = new Date(daysFromNow(7).getTime() + 60 * 60 * 1000).toISOString();
  await must(
    supabase.from("portal_schedule_records").upsert(
      {
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
      },
      { onConflict: "id" },
    ),
    "portal_schedule_records",
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Coherent browse catalog: every home shown by the public browse/apply flow
  // is manager-owned, fully listed (listingSubmission v:1), and has at least
  // one application and one lease. Split across two managers for realism.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Second test manager ────────────────────────────────────────────────────
  const manager2Email = (process.env.E2E_MANAGER2_EMAIL ?? "manager2@test.axis.local").toLowerCase();
  const manager2Password = process.env.E2E_MANAGER2_PASSWORD ?? "TestManager123!";
  const existingManager2User = managerList?.users?.find((u) => u.email?.toLowerCase() === manager2Email);
  let manager2Id = "MGR-TESTE2E2";
  if (existingManager2User) {
    const { data: manager2Profile } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", existingManager2User.id)
      .maybeSingle();
    if (manager2Profile?.manager_id?.trim()) manager2Id = manager2Profile.manager_id.trim();
  }
  const manager2UserId = await ensureUser(manager2Email, manager2Password, "manager", { managerId: manager2Id });

  const { data: purchases2 } = await supabase
    .from("manager_purchases")
    .select("id, tier")
    .eq("user_id", manager2UserId);
  const manager2HasPaidTier = (purchases2 ?? []).some((p) => {
    const t = String(p.tier ?? "").toLowerCase();
    return t === "pro" || t === "business";
  });
  if (!manager2HasPaidTier) {
    await must(
      supabase.from("manager_purchases").upsert(
        {
          stripe_checkout_session_id: "seed_e2e_m2",
          email: manager2Email,
          manager_id: manager2Id,
          tier: "pro",
          billing: "portal",
          user_id: manager2UserId,
          promo_code: "FREE100",
          paid_at: NOW.toISOString(),
        },
        { onConflict: "manager_id" },
      ),
      "manager_purchases(manager2)",
    );
  }

  // ── Catalog properties (all Seattle — a supported lease jurisdiction) ─────
  const usd = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  /** Full v1 listing submission so listings render in browse AND generated leases carry real fees/rooms/rules. */
  function buildListingSubmission(p) {
    const roomIds = p.rooms.map((r) => r.id);
    return {
      v: 1,
      buildingName: p.name,
      address: p.address,
      zip: p.zip,
      neighborhood: p.neighborhood,
      homeStructureNote: p.structureNote,
      listingPlaceCategoryId: "private_room",
      tagline: p.tagline,
      petFriendly: p.petFriendly,
      houseOverview: p.overview,
      houseRulesText:
        "Quiet hours 10pm–8am. No smoking anywhere on the premises. Overnight guests limited to 3 nights per week. Clean shared spaces after use.",
      housePhotoDataUrls: [],
      allowedLeaseTerms: ["12 months"],
      leaseTermsBody: "Available lease lengths: 12 months.",
      applicationFee: "$50",
      securityDeposit: usd(p.deposit),
      moveInFee: "$250",
      paymentAtSigningIncludes: ["security_deposit", "move_in_fee"],
      houseCostsDetail: "",
      parkingMonthly: "",
      hoaMonthly: "",
      otherMonthlyFees: "",
      sharedSpaces: [
        {
          id: "shared-kitchen",
          name: "Kitchen",
          location: "Main floor",
          detail: "Full kitchen with dishwasher, shared by all residents.",
          amenitiesText: "Refrigerator\nDishwasher\nGas range",
          photoDataUrls: [],
          videoDataUrl: null,
          roomAccessIds: roomIds,
        },
        {
          id: "shared-living",
          name: "Living room",
          location: "Main floor",
          detail: "Furnished living room with smart TV.",
          amenitiesText: "Sofa\nSmart TV",
          photoDataUrls: [],
          videoDataUrl: null,
          roomAccessIds: roomIds,
        },
      ],
      amenitiesText: "In-unit laundry\nFast Wi-Fi\nFurnished rooms",
      rooms: p.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        floor: r.floor,
        monthlyRent: r.rent,
        availability: "Now",
        moveInAvailableDate: isoDate(NOW),
        moveInInstructions: "Lockbox at front door; code shared after signing.",
        manualUnavailableRanges: [],
        detail: r.detail,
        furnishing: "Fully furnished",
        roomAmenitiesText: "Bed\nDesk\nCloset",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "$150",
        prorateMethod: "auto",
      })),
      bathrooms: [],
      bundles: [],
      quickFacts: [],
    };
  }

  const room = (n, floor, rent, detail) => ({ id: `room-${n}`, name: `Room ${n}`, floor, rent, detail });
  const catalog = [
    {
      id: "mgr-test-alder",
      name: "Alder Row — 3 rooms",
      address: "230 Alder Row, Seattle, WA 98144",
      zip: "98144",
      neighborhood: "Beacon Hill",
      tagline: "Sunny shared house steps from light rail.",
      overview:
        "A renovated 3-room shared craftsman on Beacon Hill with a shared kitchen, fast Wi-Fi, and in-unit laundry. Five minutes to the light rail station.",
      structureNote: "2-story craftsman",
      petFriendly: true,
      deposit: 1150,
      ownerUserId: managerUserId,
      rooms: [
        room(1, "2nd floor", 1150, "Queen bed and desk; south-facing window."),
        room(2, "2nd floor", 1100, "Full bed and closet; faces the garden."),
        room(3, "1st floor", 1050, "Cozy room next to the living room."),
      ],
    },
    {
      id: "mgr-test-birch",
      name: "Birch Court — 4 rooms",
      address: "812 Birch St, Seattle, WA 98107",
      zip: "98107",
      neighborhood: "Ballard",
      tagline: "Bright rooms near the water and transit.",
      overview:
        "A bright 4-room shared house in Ballard with a large kitchen, backyard deck, and quick access to the Burke-Gilman trail and rapid-ride buses.",
      structureNote: "2-story house with deck",
      petFriendly: true,
      deposit: 1250,
      ownerUserId: managerUserId,
      rooms: [
        room(1, "2nd floor", 1250, "Corner room with two windows."),
        room(2, "2nd floor", 1200, "Queen bed; faces the courtyard."),
        room(3, "1st floor", 1150, "Quiet room off the back hall."),
        room(4, "1st floor", 1100, "Compact room with garden view."),
      ],
    },
    {
      id: "mgr-test-magnolia",
      name: "Magnolia House — 5 rooms",
      address: "1420 Magnolia Ave, Seattle, WA 98122",
      zip: "98122",
      neighborhood: "Capitol Hill",
      tagline: "Furnished shared house, flexible terms.",
      overview:
        "A furnished 5-room shared house on Capitol Hill with two full bathrooms, a shared rooftop deck, and nightlife, groceries, and the streetcar within blocks.",
      structureNote: "3-story house with rooftop deck",
      petFriendly: true,
      deposit: 1300,
      ownerUserId: managerUserId,
      rooms: [
        room(1, "3rd floor", 1300, "Top-floor room with skyline view."),
        room(2, "3rd floor", 1250, "Bright room with built-in shelving."),
        room(3, "2nd floor", 1200, "Queen bed and reading nook."),
        room(4, "2nd floor", 1150, "Faces the quiet side street."),
        room(5, "1st floor", 1050, "Garden-level room with private entrance."),
      ],
    },
    {
      id: "mgr-test-fir",
      name: "Fir Lofts",
      address: "77 Fir Loft Rd, Seattle, WA 98109",
      zip: "98109",
      neighborhood: "South Lake Union",
      tagline: "Industrial loft with skyline views.",
      overview:
        "A sunlit top-floor loft in South Lake Union with exposed brick, 16-foot ceilings, skyline views, and a five-minute walk to the streetcar and Lake Union Park.",
      structureNote: "Top-floor loft in a converted warehouse",
      petFriendly: false,
      deposit: 2100,
      ownerUserId: managerUserId,
      rooms: [{ id: "room-1", name: "Loft 3", floor: "3rd floor", rent: 2100, detail: "Open-plan loft with exposed brick and skyline views." }],
    },
    {
      id: "mgr-test-cedar",
      name: "Cedar Flat 2B",
      address: "455 Cedar Way, Seattle, WA 98103",
      zip: "98103",
      neighborhood: "Fremont",
      tagline: "Modern 2-bed near the canal.",
      overview:
        "A modern 2-bedroom flat in Fremont rented as a whole unit, with an open kitchen, in-unit laundry, and the canal path at the end of the block.",
      structureNote: "Unit 2B in a 6-unit building",
      petFriendly: false,
      deposit: 2400,
      ownerUserId: manager2UserId,
      rooms: [{ id: "room-1", name: "Unit 2B", floor: "2nd floor", rent: 2400, detail: "Whole 2-bed unit with open kitchen and canal views." }],
    },
    {
      id: "mgr-test-spruce",
      name: "Spruce Studio",
      address: "9 Spruce Ln, Seattle, WA 98119",
      zip: "98119",
      neighborhood: "Queen Anne",
      tagline: "Quiet top-floor studio on Queen Anne.",
      overview:
        "A quiet top-floor studio on Queen Anne with a kitchenette, big windows, and a short walk to Kerry Park and downtown buses.",
      structureNote: "Top-floor studio",
      petFriendly: false,
      deposit: 1750,
      ownerUserId: manager2UserId,
      rooms: [{ id: "room-1", name: "Studio", floor: "3rd floor", rent: 1750, detail: "Open studio with kitchenette and big windows." }],
    },
  ];

  const propertyRows = catalog.map((p) => {
    const submission = buildListingSubmission(p);
    const rents = p.rooms.map((r) => r.rent);
    const minRent = Math.min(...rents);
    const maxRent = Math.max(...rents);
    const rentLabel =
      minRent === maxRent
        ? `$${minRent.toLocaleString("en-US")} / mo`
        : `$${minRent.toLocaleString("en-US")}–$${maxRent.toLocaleString("en-US")} / mo`;
    const unitLabel = p.rooms.length === 1 ? p.rooms[0].name : `${p.rooms.length} rooms`;
    return {
      id: p.id,
      manager_user_id: p.ownerUserId,
      status: "live",
      property_data: {
        id: p.id,
        title: p.name,
        tagline: p.tagline,
        address: p.address,
        zip: p.zip,
        neighborhood: p.neighborhood,
        beds: Math.max(p.rooms.length, 1),
        baths: p.rooms.length >= 4 ? 2 : 1,
        rentLabel,
        available: "Now",
        petFriendly: p.petFriendly,
        buildingId: `${p.id}-bld`,
        buildingName: p.name,
        unitLabel,
        mapLat: 47.61405,
        mapLng: -122.31542,
        managerUserId: p.ownerUserId,
        adminPublishLive: true,
        listingSubmission: submission,
      },
      row_data: {
        id: p.id,
        status: "live",
        name: p.name,
        buildingName: p.name,
        address: p.address,
        testRunId,
      },
      updated_at: NOW.toISOString(),
    };
  });
  await must(supabase.from("manager_property_records").upsert(propertyRows, { onConflict: "id" }), "manager_property_records(catalog)");

  // Calendar tours for catalog properties (idempotent: stable ids + upsert).
  // Each references a canonical seeded property id so the SAME property shows
  // in the Calendar and the Properties tab — never a dangling/foreign id.
  const catalogTours = [
    { id: "test-tour-fir", propId: "mgr-test-fir", managerUserId, title: "Fir Lofts Tour", daysOut: 3 },
    { id: "test-tour-cedar", propId: "mgr-test-cedar", managerUserId: manager2UserId, title: "Cedar Flat 2B Tour", daysOut: 5 },
  ];
  for (const tour of catalogTours) {
    const startsAt = daysFromNow(tour.daysOut).toISOString();
    await must(
      supabase.from("portal_schedule_records").upsert(
        {
          id: tour.id,
          manager_user_id: tour.managerUserId,
          record_type: "event",
          starts_at: startsAt,
          ends_at: new Date(daysFromNow(tour.daysOut).getTime() + 60 * 60 * 1000).toISOString(),
          row_data: {
            id: tour.id,
            title: tour.title,
            type: "tour",
            propertyId: tour.propId,
            managerUserId: tour.managerUserId,
            testRunId,
          },
        },
        { onConflict: "id" },
      ),
      `portal_schedule_records(${tour.id})`,
    );
  }

  const propById = new Map(catalog.map((p) => [p.id, p]));

  // ── Applicants: every catalog property gets ≥1 approved application (which
  //    drives a lease) plus pending/rejected spread for realistic buckets. ────
  const AUTO_RESIDENT_PASSWORD = "123Password$"; // mirrors provision-approved-resident.ts
  // `screen: "consider"` = completed Checkr report that did NOT auto-pass
  // (result "consider" → badge "flagged"), so Applications → Screening shows a
  // mix of passed vs needs-manual-review and the manual screening flow is
  // demonstrable. Everyone else gets a clear (passed) report.
  const people = [
    { axisId: "AXIS-TESTMAYACH", first: "Maya", last: "Chen", propId: "mgr-test-alder", roomId: "room-1", bucket: "approved", leaseStage: "signed", income: 96000 },
    { axisId: "AXIS-TESTETHANW", first: "Ethan", last: "Wright", propId: "mgr-test-alder", roomId: "room-2", bucket: "pending", income: 71000, screen: "consider" },
    { axisId: "AXIS-TESTDIEGOM", first: "Diego", last: "Morales", propId: "mgr-test-birch", roomId: "room-1", bucket: "approved", leaseStage: "resident_sign", income: 91000 },
    { axisId: "AXIS-TESTOLIVIB", first: "Olivia", last: "Brooks", propId: "mgr-test-birch", roomId: "room-2", bucket: "pending", income: 68000 },
    { axisId: "AXIS-TESTSOFIAD", first: "Sofia", last: "Diaz", propId: "mgr-test-magnolia", roomId: "room-1", bucket: "approved", leaseStage: "signed", income: 104000 },
    { axisId: "AXIS-TESTNOAHPA", first: "Noah", last: "Park", propId: "mgr-test-magnolia", roomId: "room-2", bucket: "approved", leaseStage: "manager_sign", income: 79000 },
    { axisId: "AXIS-TESTLUCASK", first: "Lucas", last: "Kim", propId: "mgr-test-magnolia", roomId: "room-3", bucket: "rejected", income: 40000, rejectReason: "Income below 2.5x rent.", screen: "consider" },
    { axisId: "AXIS-TESTLIAMFO", first: "Liam", last: "Foster", propId: "mgr-test-fir", roomId: "room-1", bucket: "approved", leaseStage: "signed", income: 98000 },
    { axisId: "AXIS-TESTISABEN", first: "Isabella", last: "Nguyen", propId: "mgr-test-cedar", roomId: "room-1", bucket: "approved", leaseStage: "manager", income: 120000 },
    { axisId: "AXIS-TESTMASONC", first: "Mason", last: "Clark", propId: "mgr-test-cedar", roomId: "room-1", bucket: "pending", income: 88000, screen: "consider" },
    { axisId: "AXIS-TESTAVAROS", first: "Ava", last: "Rossi", propId: "mgr-test-spruce", roomId: "room-1", bucket: "approved", leaseStage: "admin", income: 82000 },
  ].map((p, i) => {
    const prop = propById.get(p.propId);
    const roomDef = prop.rooms.find((r) => r.id === p.roomId);
    return {
      ...p,
      index: i,
      name: `${p.first} ${p.last}`,
      email: `${p.first}.${p.last}.e2e@test.axis.local`.toLowerCase(),
      prop,
      room: roomDef,
      rent: roomDef.rent,
      roomChoice: `${p.propId}::${p.roomId}`,
    };
  });

  /** Full RentalWizardFormState mirroring the primary resident's application above. */
  function buildCatalogApplication(p) {
    const appLeaseStart = isoDate(daysFromNow(10));
    const appLeaseEnd = isoDate(daysFromNow(375));
    return {
      fullLegalName: p.name,
      email: p.email,
      phone: `(206) 555-0${String(140 + p.index).padStart(3, "0")}`,
      dateOfBirth: "1995-05-14",
      ssn: "000-00-0000",
      driversLicense: "WA-DL-4821990",
      employer: "Northwest Tech Co.",
      jobTitle: "Analyst",
      employerAddress: "500 Union St, Seattle, WA",
      employmentStart: "2022-03-01",
      supervisorName: "Dana Wells",
      supervisorPhone: "(206) 555-0133",
      monthlyIncome: String(Math.round(p.income / 12)),
      annualIncome: String(p.income),
      notEmployed: false,
      otherIncome: "",
      occupancyCount: "1",
      pets: "None",
      currentStreet: "88 Maple Court",
      currentCity: "Seattle",
      currentState: "WA",
      currentZip: "98122",
      currentMoveIn: "2023-06-01",
      currentMoveOut: "",
      currentLandlordName: "Cedar Property Mgmt",
      currentLandlordPhone: "(206) 555-0190",
      currentReasonLeaving: "Relocating closer to work",
      noPreviousAddress: false,
      prevStreet: "4102 Oak Glen Dr",
      prevCity: "Seattle",
      prevState: "WA",
      prevZip: "98115",
      prevMoveIn: "2021-01-15",
      prevMoveOut: "2023-05-30",
      prevLandlordName: "Sunset Property Mgmt",
      prevLandlordPhone: "(206) 555-0177",
      prevReasonLeaving: "Lease ended",
      ref1Name: "Priya Nair",
      ref1Phone: "(206) 555-0166",
      ref1Relationship: "Former colleague",
      ref2Name: "Marcus Lee",
      ref2Phone: "(206) 555-0188",
      ref2Relationship: "Friend",
      criminalHistory: "no",
      criminalDetails: "",
      evictionHistory: "no",
      evictionDetails: "",
      bankruptcyHistory: "no",
      bankruptcyDetails: "",
      hasCosigner: "no",
      applyingAsGroup: "no",
      groupId: "",
      groupRole: null,
      groupSize: "",
      propertyId: p.propId,
      rentalType: "standard",
      leaseTerm: "12 months",
      leaseStart: appLeaseStart,
      leaseEnd: appLeaseEnd,
      roomChoice1: p.roomChoice,
      roomChoice2: "",
      roomChoice3: "",
      shortTermCheckInTime: "",
      shortTermCheckOutTime: "",
      managerRentOverride: String(p.rent),
      managerUtilitiesOverride: "150",
      managerSecurityDepositOverride: String(p.prop.deposit),
      managerMoveInFeeOverride: "250",
      managerOtherCostLabel: "",
      managerOtherCostAmount: "",
      __signedRentLabel: `${usd(p.rent)} / month`,
      consentTruth: true,
      consentCredit: true,
      dateSigned: isoDate(daysFromNow(-2)),
      digitalSignature: p.name,
      applicationFeePayChannel: "stripe",
      applicationFeeAcknowledged: true,
      applicationFeeZelleSentConfirmed: false,
    };
  }

  // Completed (simulated) Checkr report stored the same way
  // runBackgroundCheck persists it (src/lib/checkr/background-check.ts):
  // `backgroundCheck` is the Checkr object, `backgroundCheckStatus` the badge
  // backgroundCheckStatusFromCheckr derives — "passed" for clear, "flagged"
  // (needs manual review) for consider. Stable ids keep re-runs idempotent.
  function buildSeedBackgroundCheck(p) {
    const consider = p.screen === "consider";
    return {
      provider: "checkr",
      candidateId: `seed-cand-${p.axisId.toLowerCase()}`,
      reportId: `seed-report-${p.axisId.toLowerCase()}`,
      packageSlug: "test_pro_criminal",
      status: "complete",
      result: consider ? "consider" : "clear",
      assessment: consider ? "review" : "eligible",
      orderedAt: daysFromNow(-2).toISOString(),
      completedAt: daysFromNow(-1).toISOString(),
      simulated: true,
    };
  }

  const applicationRows = people.map((p) => {
    const approved = p.bucket === "approved";
    const stage = approved ? "Approved - placed" : p.bucket === "rejected" ? "Rejected" : "Submitted";
    const detail = approved
      ? `Approved for ${p.room.name}`
      : p.bucket === "rejected"
        ? p.rejectReason
        : `Submitted ${isoDate(daysFromNow(-1))}`;
    const backgroundCheck = buildSeedBackgroundCheck(p);
    return {
      id: p.axisId,
      manager_user_id: p.prop.ownerUserId,
      resident_email: p.email,
      property_id: p.propId,
      assigned_property_id: approved ? p.propId : null,
      row_data: {
        id: p.axisId,
        axisId: p.axisId,
        bucket: p.bucket,
        stage,
        detail,
        email: p.email,
        name: p.name,
        property: p.prop.name,
        application: buildCatalogApplication(p),
        backgroundCheck,
        backgroundCheckStatus: backgroundCheck.result === "clear" ? "passed" : "flagged",
        managerUserId: p.prop.ownerUserId,
        propertyId: p.propId,
        ...(approved
          ? {
              assignedPropertyId: p.propId,
              assignedRoomChoice: p.roomChoice,
              signedMonthlyRent: p.rent,
            }
          : {}),
        testRunId,
      },
      updated_at: NOW.toISOString(),
    };
  });
  await must(supabase.from("manager_application_records").upsert(applicationRows, { onConflict: "id" }), "manager_application_records(catalog)");

  // ── Resident accounts for approved applicants (mirrors provisionApprovedResidentAccount) ──
  const approvedPeople = people.filter((p) => p.bucket === "approved");
  for (const p of approvedPeople) {
    p.residentUserId = await ensureUser(p.email, AUTO_RESIDENT_PASSWORD, "resident", {
      metadata: { axis_id: p.axisId, auto_provisioned_resident: true },
    });
    await must(
      supabase.from("profiles").upsert(
        {
          id: p.residentUserId,
          email: p.email,
          role: "resident",
          manager_id: p.axisId,
          full_name: p.name,
          application_approved: true,
        },
        { onConflict: "id" },
      ),
      `profiles(${p.email})`,
    );
  }

  // ── Leases: one per approved application, spread across pipeline stages.
  //    Ids use the app's own convention (lease_app_<axisId>, see
  //    lease-pipeline-storage.ts syncApprovedApplications) so the portal reuses
  //    these rows instead of auto-creating duplicates. ───────────────────────
  const leaseHtml = (p) =>
    `<section class="lease-doc"><h1>Residential Lease Agreement</h1>` +
    `<p><strong>Tenant:</strong> ${p.name}</p><p><strong>Premises:</strong> ${p.prop.name} · ${p.room.name}</p>` +
    `<p><strong>Monthly Rent:</strong> ${usd(p.rent)}</p><p><strong>Term:</strong> 12 months</p>` +
    `<p>This agreement is generated from the approved rental application and governed by Washington State (Seattle) law.</p></section>`;

  function buildCatalogLeaseRow(p) {
    const genIso = daysFromNow(-4).toISOString();
    const sentIso = daysFromNow(-3).toISOString();
    const resSignIso = daysFromNow(-2).toISOString();
    const mgrSignIso = daysFromNow(-1).toISOString();
    const row = {
      id: `lease_app_${p.axisId}`,
      residentName: p.name,
      residentEmail: p.email,
      unit: `${p.prop.name} · ${p.room.name}`,
      updated: "just now",
      pdfVersion: 2,
      versionNumber: 2,
      notes: "Created from approved application.",
      updatedAtIso: NOW.toISOString(),
      axisId: p.axisId,
      propertyId: p.propId,
      managerUserId: p.prop.ownerUserId,
      residentUserId: p.residentUserId ?? null,
      roomChoice: p.roomChoice,
      signedRentLabel: `${usd(p.rent)} / month`,
      application: buildCatalogApplication(p),
      generatedHtml: leaseHtml(p),
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
      testRunId,
    };
    if (p.leaseStage === "manager") return row;
    if (p.leaseStage === "admin") {
      return { ...row, bucket: "admin", status: "Admin Review", stageLabel: "Admin Review", currentActorRole: "admin", adminReviewRequestedAt: sentIso };
    }
    if (p.leaseStage === "resident_sign") {
      return { ...row, bucket: "resident", status: "Resident Signature Pending", stageLabel: "Resident Signature Pending", currentActorRole: "resident", sentToResidentAt: sentIso };
    }
    const resSig = { name: p.name, signedAtIso: resSignIso, role: "resident" };
    if (p.leaseStage === "manager_sign") {
      return {
        ...row,
        bucket: "signed",
        status: "Manager Signature Pending",
        stageLabel: "Manager Signature Pending",
        currentActorRole: "manager",
        sentToResidentAt: sentIso,
        residentSignature: resSig,
        signatureName: p.name,
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
      sentToResidentAt: sentIso,
      residentSignature: resSig,
      managerSignature: { name: "Test Manager", signedAtIso: mgrSignIso, role: "manager" },
      signatureName: p.name,
      signedAtIso: resSignIso,
      residentSignedAt: resSignIso,
      managerSignedAt: mgrSignIso,
      fullySignedAt: mgrSignIso,
    };
  }

  const leaseRows = approvedPeople.map((p) => {
    const row = buildCatalogLeaseRow(p);
    return {
      id: row.id,
      manager_user_id: p.prop.ownerUserId,
      resident_user_id: p.residentUserId ?? null,
      resident_email: p.email,
      property_id: p.propId,
      status: row.bucket,
      row_data: row,
      updated_at: NOW.toISOString(),
    };
  });

  // The primary E2E property also gets a lease (manager-review, no generated
  // HTML yet) so no browse property is lease-less. Same id the portal's
  // approved-application sync would mint, so it adopts this row.
  leaseRows.push({
    id: `lease_app_${residentAxisId}`,
    manager_user_id: managerUserId,
    resident_user_id: residentUserId,
    resident_email: residentEmail,
    property_id: propertyId,
    status: "manager",
    row_data: {
      id: `lease_app_${residentAxisId}`,
      residentName: "Test Resident",
      residentEmail,
      unit: `${propertyName} · Room 1`,
      updated: "just now",
      pdfVersion: 1,
      versionNumber: 1,
      notes: "Created from approved application.",
      updatedAtIso: NOW.toISOString(),
      axisId: residentAxisId,
      propertyId,
      managerUserId,
      residentUserId,
      roomChoice,
      signedRentLabel: `$${monthlyRent.toFixed(2)} / month`,
      application,
      generatedHtml: null,
      generatedAtIso: null,
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
      testRunId,
    },
    updated_at: NOW.toISOString(),
  });
  await must(supabase.from("portal_lease_pipeline_records").upsert(leaseRows, { onConflict: "id" }), "portal_lease_pipeline_records(catalog)");

  // ── Cleanup: make every tab agree on the canonical catalog. ───────────────
  const canonicalIds = new Set([propertyId, ...catalog.map((p) => p.id)]);
  const testManagerIds = [managerUserId, manager2UserId];

  // 1. Superseded property rows from older seeds — ANY status, not just live.
  //    A leftover `review` row (e.g. the old seedwf_ "Fir Loft 3") reaches the
  //    Calendar property picker (review rows land in extras) but never the
  //    Properties tab (which needs a `mgr-` id prefix) — the tabs disagree.
  const { data: ownedProps, error: ownedPropsErr } = await supabase
    .from("manager_property_records")
    .select("id, status, manager_user_id")
    .in("manager_user_id", testManagerIds);
  if (ownedPropsErr) throw new Error(`select owned properties: ${ownedPropsErr.message}`);
  const staleIds = (ownedProps ?? []).map((r) => r.id).filter((id) => !canonicalIds.has(id));
  if (staleIds.length) {
    await must(supabase.from("manager_property_records").delete().in("id", staleIds), "cleanup manager_property_records");
    console.error(`Cleaned ${staleIds.length} superseded properties: ${staleIds.join(", ")}`);
  }

  // 2. Applications, leases, charges, and rent profiles must reference a
  //    canonical property. This also removes rows whose property no longer
  //    exists at all (e.g. charges pointing at a deleted demo property).
  for (const table of [
    "manager_application_records",
    "portal_lease_pipeline_records",
    "portal_household_charge_records",
    "portal_recurring_rent_profile_records",
  ]) {
    const { data: depRows, error: depSelErr } = await supabase
      .from(table)
      .select("id, property_id")
      .in("manager_user_id", testManagerIds);
    if (depSelErr) throw new Error(`select ${table}: ${depSelErr.message}`);
    const orphanIds = (depRows ?? [])
      .filter((r) => r.property_id && !canonicalIds.has(r.property_id))
      .map((r) => r.id);
    if (orphanIds.length) {
      await must(supabase.from(table).delete().in("id", orphanIds), `cleanup ${table}`);
      console.error(`Cleaned ${orphanIds.length} ${table} rows referencing non-canonical properties`);
    }
  }

  // 3. Calendar events must reference canonical properties too.
  const { data: eventRows, error: eventSelErr } = await supabase
    .from("portal_schedule_records")
    .select("id, row_data")
    .eq("record_type", "event")
    .in("manager_user_id", testManagerIds);
  if (eventSelErr) throw new Error(`select schedule events: ${eventSelErr.message}`);
  const danglingEventIds = (eventRows ?? [])
    .filter((r) => {
      const pid = typeof r.row_data?.propertyId === "string" ? r.row_data.propertyId.trim() : "";
      return pid && !canonicalIds.has(pid);
    })
    .map((r) => r.id);
  if (danglingEventIds.length) {
    await must(
      supabase.from("portal_schedule_records").delete().in("id", danglingEventIds),
      "cleanup portal_schedule_records(events)",
    );
    console.error(`Cleaned ${danglingEventIds.length} calendar events referencing non-canonical properties`);
  }

  // 4. Tour-host registry (global KV record): prune entries whose property no
  //    longer exists in manager_property_records at all.
  const { data: registryRec, error: registryErr } = await supabase
    .from("portal_schedule_records")
    .select("id, row_data")
    .eq("id", "axis_property_mgr_registry_v1")
    .maybeSingle();
  if (registryErr) throw new Error(`select tour-host registry: ${registryErr.message}`);
  const registryPayload = registryRec?.row_data?.payload;
  if (registryPayload && typeof registryPayload === "object" && !Array.isArray(registryPayload)) {
    const { data: allProps, error: allPropsErr } = await supabase.from("manager_property_records").select("id");
    if (allPropsErr) throw new Error(`select all property ids: ${allPropsErr.message}`);
    const existingIds = new Set((allProps ?? []).map((r) => r.id));
    const prunedKeys = Object.keys(registryPayload).filter((pid) => !existingIds.has(pid));
    if (prunedKeys.length) {
      const nextPayload = { ...registryPayload };
      for (const key of prunedKeys) delete nextPayload[key];
      await must(
        supabase
          .from("portal_schedule_records")
          .update({ row_data: { ...registryRec.row_data, payload: nextPayload } })
          .eq("id", "axis_property_mgr_registry_v1"),
        "prune tour-host registry",
      );
      console.error(`Pruned ${prunedKeys.length} dangling tour-host registry entries: ${prunedKeys.join(", ")}`);
    }
  }

  // 5. Runtime drift on NON-approved seeded applicants: approving one in the
  //    portal mints a lease, move-in charges, and an approved resident profile.
  //    The upserts above reset the application bucket, so those leftovers would
  //    contradict it (a pending applicant with a signed lease). Remove them.
  const nonApproved = people.filter((p) => p.bucket !== "approved");
  const nonApprovedAxisIds = nonApproved.map((p) => p.axisId);
  const nonApprovedEmails = new Set(nonApproved.map((p) => p.email));
  const { data: driftLeases, error: driftLeaseErr } = await supabase
    .from("portal_lease_pipeline_records")
    .select("id")
    .in("id", nonApprovedAxisIds.map((axisId) => `lease_app_${axisId}`));
  if (driftLeaseErr) throw new Error(`select drift leases: ${driftLeaseErr.message}`);
  if (driftLeases?.length) {
    await must(
      supabase.from("portal_lease_pipeline_records").delete().in("id", driftLeases.map((r) => r.id)),
      "cleanup portal_lease_pipeline_records(non-approved)",
    );
    console.error(`Cleaned ${driftLeases.length} leases for non-approved applicants`);
  }
  for (const table of ["portal_household_charge_records", "portal_recurring_rent_profile_records"]) {
    const { data: driftRows, error: driftSelErr } = await supabase
      .from(table)
      .select("id, row_data")
      .in("manager_user_id", testManagerIds);
    if (driftSelErr) throw new Error(`select ${table} drift: ${driftSelErr.message}`);
    const driftIds = (driftRows ?? [])
      .filter((r) => {
        const appId = typeof r.row_data?.applicationId === "string" ? r.row_data.applicationId : "";
        const email = typeof r.row_data?.residentEmail === "string" ? r.row_data.residentEmail.toLowerCase() : "";
        return nonApprovedAxisIds.includes(appId) || nonApprovedEmails.has(email);
      })
      .map((r) => r.id);
    if (driftIds.length) {
      await must(supabase.from(table).delete().in("id", driftIds), `cleanup ${table}(non-approved)`);
      console.error(`Cleaned ${driftIds.length} ${table} rows for non-approved applicants`);
    }
  }
  await must(
    supabase.from("profiles").update({ application_approved: false }).in("manager_id", nonApprovedAxisIds),
    "reset non-approved resident profiles",
  );

  // 6. Account prune: the test DB contains ONLY canonical test accounts — the
  //    E2E accounts this seed creates plus the demo-workflow residents
  //    (scripts/seed-demo-manager-workflow.mjs). Anything else (OAuth-test
  //    artifacts, one-off signups, the production admin) is deleted together
  //    with its rows, so strays never accumulate and prod accounts never live
  //    here. assertTestProjectUrl above guarantees this only ever runs against
  //    the dedicated test project.
  const canonicalEmails = new Set([
    adminEmail,
    managerEmail,
    manager2Email,
    residentEmail,
    ...people.map((p) => p.email),
    ...DEMO_WORKFLOW_RESIDENT_EMAILS,
  ]);
  if (canonicalEmails.has(PRODUCTION_ADMIN_EMAIL)) {
    throw new Error(`The production admin (${PRODUCTION_ADMIN_EMAIL}) can never be a canonical test account.`);
  }
  // Tables owning rows keyed by user id (uuid) — kept in sync with the schema;
  // must() fails loudly if a table disappears so the prune never rots silently.
  const PRUNE_USER_ID_TABLES = [
    ["agent_sessions", ["user_id"]],
    ["device_push_tokens", ["user_id"]],
    ["manager_purchases", ["user_id"]],
    ["chart_of_accounts", ["manager_user_id"]],
    ["cosigner_submission_records", ["manager_user_id"]],
    ["ledger_entries", ["manager_user_id", "resident_user_id"]],
    ["manager_application_records", ["manager_user_id"]],
    ["manager_automation_settings", ["manager_user_id"]],
    ["manager_expense_entries", ["manager_user_id"]],
    ["manager_promotion_records", ["manager_user_id"]],
    ["manager_property_records", ["manager_user_id"]],
    ["manager_tax_profiles", ["manager_user_id"]],
    ["manager_vendor_records", ["manager_user_id"]],
    ["portal_household_charge_records", ["manager_user_id", "resident_user_id"]],
    ["portal_inbox_thread_records", ["owner_user_id"]],
    ["portal_lease_pipeline_records", ["manager_user_id", "resident_user_id"]],
    ["portal_pro_relationship_records", ["manager_user_id"]],
    ["portal_recurring_rent_profile_records", ["manager_user_id", "resident_user_id"]],
    ["portal_resident_lease_upload_records", ["resident_user_id"]],
    ["portal_schedule_records", ["manager_user_id"]],
    ["portal_scheduled_inbox_message_records", ["manager_user_id"]],
    ["portal_service_request_records", ["manager_user_id"]],
    ["portal_work_order_records", ["manager_user_id"]],
    ["scheduled_message_overrides", ["manager_user_id"]],
    ["screening_orders", ["manager_user_id"]],
    ["vendor_tax_profiles", ["manager_user_id"]],
    ["profile_roles", ["user_id"]],
    ["profiles", ["id"]],
  ];
  // Tables referencing accounts by email.
  const PRUNE_EMAIL_TABLES = [
    ["ledger_entries", "resident_email"],
    ["manager_application_records", "resident_email"],
    ["manager_purchases", "email"],
    ["portal_bug_feedback_records", "reporter_email"],
    ["portal_household_charge_records", "resident_email"],
    ["portal_inbox_thread_records", "participant_email"],
    ["portal_lease_pipeline_records", "resident_email"],
    ["portal_outbound_mail_records", "recipient_email"],
    ["portal_recurring_rent_profile_records", "resident_email"],
    ["portal_resident_lease_upload_records", "resident_email"],
    ["portal_service_request_records", "resident_email"],
    ["portal_work_order_records", "resident_email"],
  ];
  const { data: allUsersData, error: allUsersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (allUsersErr) throw new Error(`listUsers(prune): ${allUsersErr.message}`);
  const strayUsers = (allUsersData?.users ?? []).filter(
    (u) => !canonicalEmails.has((u.email ?? "").trim().toLowerCase()),
  );
  const prunedAccounts = [];
  for (const stray of strayUsers) {
    const strayEmail = (stray.email ?? "").trim().toLowerCase();
    for (const [table, cols] of PRUNE_USER_ID_TABLES) {
      for (const col of cols) {
        await must(supabase.from(table).delete().eq(col, stray.id), `prune ${table}.${col}(${strayEmail || stray.id})`);
      }
    }
    if (strayEmail) {
      for (const [table, col] of PRUNE_EMAIL_TABLES) {
        await must(supabase.from(table).delete().eq(col, strayEmail), `prune ${table}.${col}(${strayEmail})`);
      }
    }
    const { error: delUserErr } = await supabase.auth.admin.deleteUser(stray.id);
    if (delUserErr) throw new Error(`deleteUser(${strayEmail || stray.id}): ${delUserErr.message}`);
    prunedAccounts.push(strayEmail || stray.id);
    console.error(`Pruned non-canonical account: ${strayEmail || stray.id}`);
  }
  // Orphan profiles (no auth user, e.g. a half-deleted account) are pruned by
  // email the same way so the admin Accounts view can never resurrect them.
  const { data: allProfiles, error: allProfilesErr } = await supabase.from("profiles").select("id, email");
  if (allProfilesErr) throw new Error(`select profiles(prune): ${allProfilesErr.message}`);
  const orphanProfileIds = (allProfiles ?? [])
    .filter((p) => !canonicalEmails.has((p.email ?? "").trim().toLowerCase()))
    .map((p) => p.id);
  if (orphanProfileIds.length) {
    await must(supabase.from("profile_roles").delete().in("user_id", orphanProfileIds), "prune orphan profile_roles");
    await must(supabase.from("profiles").delete().in("id", orphanProfileIds), "prune orphan profiles");
    console.error(`Pruned ${orphanProfileIds.length} orphan profiles`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      testRunId,
      adminId,
      managerUserId,
      managerId,
      manager2UserId,
      manager2Id,
      manager2Email,
      propertyId,
      residentUserId,
      residentEmail,
      residentAxisId,
      applicationId: residentAxisId,
      chargeId,
      tourId,
      catalogTours: catalogTours.map((t) => t.id),
      catalogProperties: catalog.map((p) => p.id),
      catalogApplications: people.length,
      catalogLeases: leaseRows.length,
      cleanedStaleProperties: staleIds,
      cleanedDanglingCalendarEvents: danglingEventIds,
      prunedAccounts,
    }),
  );
} catch (err) {
  console.error(err);
  process.exit(1);
}
