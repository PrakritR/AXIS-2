#!/usr/bin/env node
/**
 * Seeds a dedicated Supabase test project with admin, manager, resident, and sample data.
 * Usage: node --env-file=.env.test tests/helpers/seed-test-db.mjs [testRunId]
 *
 * Every upsert is error-checked (`must`) so a schema mismatch fails the run loudly
 * instead of silently leaving the test accounts disconnected.
 *
 * Reference implementation for column names / row shapes:
 * scripts/seed-demo-manager-workflow.mjs
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
// Must match E2E_RESIDENT_AXIS_ID in tests/fixtures/index.ts. The application
// record id IS the resident's axis id (see normalizeApplicationAxisId), and the
// resident's `profiles.manager_id` stores the same axis id — that is where the
// app reads it (resident-portal-access.ts, resident-profile-panel.tsx).
const residentAxisId = process.env.E2E_RESIDENT_AXIS_ID ?? "AXIS-TESTRSID";

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
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
  const propertyId = "test-prop-e2e";
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
      applicationId: residentAxisId,
      chargeId,
      tourId,
    }),
  );
} catch (err) {
  console.error(err);
  process.exit(1);
}
