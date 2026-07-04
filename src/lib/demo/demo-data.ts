/**
 * Pure, server-safe demo dataset for the public `/demo` sandbox. No browser or
 * store imports — only types — so this same fictional data backs BOTH the
 * client-seeded portal panels (`demo-seed.ts`) and the sandboxed agent context
 * (`/api/agent/demo-chat`). Keeping one source means the chatbot's answers match
 * what the visitor sees on screen.
 */
import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import type { PartnerInquiry, PlannedEvent } from "@/lib/demo-admin-scheduling";
import type { UploadedOwnLease } from "@/lib/resident-lease-upload";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { PortalBugFeedbackRow } from "@/lib/portal-bug-feedback";
import type { InboxMessage } from "@/lib/demo-admin-partner-inbox";
import {
  DEMO_MANAGER_EMAIL,
  DEMO_MANAGER_NAME,
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_EMAIL,
  DEMO_RESIDENT_NAME,
  DEMO_RESIDENT_USER_ID,
  DEMO_VENDOR_NAME,
} from "@/lib/demo/demo-session";

// --- date helpers (relative to "now" so the demo never goes stale) -----------
export function monthKey(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}
export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
export function dateLabel(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
/** ISO timestamp `days` from now at a specific local wall-clock time. */
export function isoAtTime(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
/** Local `YYYY-MM-DD` for `days` from now (matches the calendar's local date keys). */
export function localDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
/** `YYYY-MM-DD` (UTC) for `days` from now — used for report/ledger dates. */
export function isoDateOnly(days: number): string {
  return isoDaysFromNow(days).slice(0, 10);
}

// The demo resident's lease term: a 12-month agreement starting in two weeks.
// The lease seeds awaiting the resident's signature so a visitor can play the
// signing flow (resident signs → manager countersigns) inside the sandbox.
export const DEMO_LEASE_START_DAYS = 14;
export const DEMO_LEASE_END_DAYS = 379;

// Manager-created listings are keyed with an `mgr-` id prefix — the property
// inventory helpers (`adminKpiCounts`, the Properties tab buckets) only count and
// render listings whose id starts with `mgr-`.
export const PROP = {
  pioneer: "mgr-demo-pioneer",
  cascade: "mgr-demo-cascade",
  emerald: "mgr-demo-emerald",
  lakeview: "mgr-demo-lakeview",
} as const;

export const PROP_LABEL: Record<string, string> = {
  [PROP.pioneer]: "The Pioneer · 12A",
  [PROP.cascade]: "Cascade Lofts · 4B",
  [PROP.emerald]: "Emerald Court · 3",
  [PROP.lakeview]: "Lakeview Flats · S2",
};

/** Room-choice value (`propertyId::roomId`) for a demo property's single unit. */
export function demoRoomChoice(propertyId: string): string {
  return `${propertyId}::room-1`;
}

// Generic house illustrations bundled under `public/demo/` (no remote URLs, so
// they always render). Flow through `listingSubmission.housePhotoDataUrls`
// into browse cards, property pickers, and the listing hero gallery.
export const DEMO_HOUSE_IMAGE: Record<string, string> = {
  [PROP.pioneer]: "/demo/house-pioneer.svg",
  [PROP.cascade]: "/demo/house-cascade.svg",
  [PROP.emerald]: "/demo/house-emerald.svg",
  [PROP.lakeview]: "/demo/house-lakeview.svg",
};

/**
 * Minimal-but-valid listing submission so listing-backed features light up in
 * the demo: resident service-request offers, Axis ACH pay eligibility, and
 * room-choice label resolution all read `property.listingSubmission`.
 */
function demoListingSubmission(input: {
  id: string;
  title: string;
  address: string;
  neighborhood: string;
  rent: number;
  unit: string;
}): ManagerListingSubmissionV1 {
  const serviceOption = (
    id: string,
    name: string,
    description: string,
    price: string,
    deposit = "",
  ) => ({
    id,
    name,
    description,
    price,
    deposit,
    available: true,
    createdAt: isoDaysFromNow(-60),
  });
  return {
    v: 1,
    buildingName: input.title,
    address: `${input.address}, Seattle, WA`,
    zip: "98101",
    neighborhood: input.neighborhood,
    homeStructureNote: "",
    tagline: "Bright, well-maintained Seattle rental",
    petFriendly: true,
    houseOverview:
      "Light-filled home minutes from downtown Seattle, with in-unit laundry, secure entry, and quick access to transit.",
    houseRulesText: "Quiet hours 10pm–8am · No smoking · Guests welcome up to 7 nights",
    wifiNetworkName: "AxisHome-5G",
    wifiPassword: "welcome-home-2026",
    generalHouseInfo:
      "Trash & recycling pickup is Tuesday morning — bins live in the alley.\nBuilding entry code is shared at key pickup.",
    housePhotoDataUrls: DEMO_HOUSE_IMAGE[input.id] ? [DEMO_HOUSE_IMAGE[input.id]!] : [],
    leaseTermsBody: "12-month lease standard; month-to-month available on renewal.",
    applicationFee: "$45.00",
    securityDeposit: "$500.00",
    moveInFee: "$150.00",
    paymentAtSigningIncludes: [],
    houseCostsDetail: "",
    parkingMonthly: "$120.00",
    hoaMonthly: "$0.00",
    otherMonthlyFees: "$0.00",
    sharedSpaces: [],
    amenitiesText: "In-unit laundry\nStainless appliances\nSecure entry\nBike storage",
    entireHomeMonthlyRent: input.rent,
    axisPaymentsEnabled: true,
    rooms: [
      {
        id: "room-1",
        name: input.unit,
        floor: "",
        monthlyRent: input.rent,
        availability: "Occupied",
        moveInAvailableDate: "",
        moveInInstructions: "Keys and fobs at the leasing office after 3pm on move-in day.",
        manualUnavailableRanges: [],
        detail: "",
        furnishing: "Unfurnished",
        roomAmenitiesText: "",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "$85",
      },
    ],
    bathrooms: [],
    bundles: [],
    quickFacts: [],
    serviceRequestOptions: [
      serviceOption("svc-parking", "Reserved parking spot", "Assigned covered spot in the building garage.", "$120.00"),
      serviceOption("svc-storage", "Extra storage unit", "5×5 secure storage cage on the ground floor.", "$45.00"),
      serviceOption("svc-cleaning", "Deep-clean visit", "One-time professional deep clean of your unit.", "$150.00"),
      serviceOption("svc-pet", "Pet registration", "Register a cat or dog for your unit.", "$35.00", "$150.00"),
    ],
  };
}

export function demoProperties(): MockProperty[] {
  const base = (
    id: string,
    title: string,
    address: string,
    neighborhood: string,
    beds: number,
    baths: number,
    rent: number,
    unit: string,
  ): MockProperty => ({
    id,
    title,
    tagline: "Bright, well-maintained Seattle rental",
    address,
    zip: "98101",
    neighborhood,
    beds,
    baths,
    rentLabel: `$${rent.toLocaleString()}/mo`,
    available: "Now",
    petFriendly: true,
    buildingId: id,
    buildingName: title,
    unitLabel: unit,
    managerUserId: DEMO_MANAGER_USER_ID,
    adminPublishLive: true,
    listingSubmission: demoListingSubmission({ id, title, address, neighborhood, rent, unit }),
  });
  return [
    base(PROP.pioneer, "The Pioneer", "12 Pike St", "Pioneer Square", 2, 1, 2400, "Unit 12A"),
    base(PROP.cascade, "Cascade Lofts", "88 Bell St", "Belltown", 1, 1, 1950, "Unit 4B"),
    base(PROP.emerald, "Emerald Court", "455 Boren Ave", "First Hill", 3, 2, 3200, "Unit 3"),
    base(PROP.lakeview, "Lakeview Flats", "210 Fairview Ave N", "South Lake Union", 0, 1, 1700, "Unit S2"),
  ];
}

/**
 * `DemoApplicantRow.application` is typed as the full wizard form, but every
 * reader treats it as partial data (`row.application ?? {}` / optional field
 * reads). The demo only needs the lease/property fields, so assert the subset.
 */
function demoApplicationData(input: Partial<RentalWizardFormState>): RentalWizardFormState {
  return input as RentalWizardFormState;
}

export function demoApplications(): DemoApplicantRow[] {
  const mk = (
    id: string,
    name: string,
    email: string,
    propertyId: string,
    stage: string,
    bucket: DemoApplicantRow["bucket"],
    detail: string,
    extra: Partial<DemoApplicantRow> = {},
  ): DemoApplicantRow => ({
    id,
    name,
    email,
    property: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
    propertyId,
    assignedPropertyId: propertyId,
    stage,
    bucket,
    detail,
    managerUserId: DEMO_MANAGER_USER_ID,
    ...extra,
  });
  return [
    mk("demo-app-1", "Priya Sharma", "priya.sharma@example.com", PROP.cascade, "Screening", "pending",
      "Applied 2 days ago · credit check in progress", {
        backgroundCheckStatus: "pending_review",
        // Even final SSN digit → the Checkr demo simulation resolves this one Clear.
        application: demoApplicationData({
          propertyId: PROP.cascade,
          fullLegalName: "Priya Sharma",
          email: "priya.sharma@example.com",
          ssn: "123-45-6784",
          consentCredit: true,
        }),
      }),
    mk("demo-app-2", "Marcus Chen", "marcus.chen@example.com", PROP.emerald, "New application", "pending",
      "Submitted application, awaiting first review", {
        // Even final SSN digit → the Checkr demo simulation resolves this one Clear.
        application: demoApplicationData({
          propertyId: PROP.emerald,
          fullLegalName: "Marcus Chen",
          email: "marcus.chen@example.com",
          ssn: "123-45-6782",
          consentCredit: true,
        }),
      }),
    mk("demo-app-3", "Sofia Rossi", "sofia.rossi@example.com", PROP.pioneer, "Documents requested", "pending",
      "Income verification requested", {
        // Odd final SSN digit → the Checkr demo simulation resolves this one to
        // Consider, so the sandbox always has a live FCRA-banner example.
        application: demoApplicationData({
          propertyId: PROP.pioneer,
          fullLegalName: "Sofia Rossi",
          email: "sofia.rossi@example.com",
          ssn: "123-45-6787",
          consentCredit: true,
        }),
      }),
    mk("demo-app-4", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, "Approved · lease sent", "approved",
      "Lease sent — awaiting signature", {
        signedMonthlyRent: 2400,
        assignedRoomChoice: demoRoomChoice(PROP.pioneer),
        backgroundCheckStatus: "passed",
        moveInInstructions: "Keys available at the Pioneer Square office after 3pm on move-in day.",
        application: demoApplicationData({
          propertyId: PROP.pioneer,
          roomChoice1: demoRoomChoice(PROP.pioneer),
          leaseStart: dateLabel(DEMO_LEASE_START_DAYS),
          leaseEnd: dateLabel(DEMO_LEASE_END_DAYS),
        }),
      }),
    mk("demo-app-5", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, "Approved · active", "approved",
      "Long-term resident since last year", {
        signedMonthlyRent: 3200,
        assignedRoomChoice: demoRoomChoice(PROP.emerald),
        backgroundCheckStatus: "passed",
        application: demoApplicationData({
          propertyId: PROP.emerald,
          roomChoice1: demoRoomChoice(PROP.emerald),
          leaseStart: dateLabel(-35),
          leaseEnd: dateLabel(330),
        }),
      }),
    mk("demo-app-6", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, "Approved · active", "approved",
      "Renewed lease this spring", {
        signedMonthlyRent: 1950,
        assignedRoomChoice: demoRoomChoice(PROP.cascade),
        backgroundCheckStatus: "passed",
        application: demoApplicationData({
          propertyId: PROP.cascade,
          roomChoice1: demoRoomChoice(PROP.cascade),
          leaseStart: dateLabel(-90),
          leaseEnd: dateLabel(275),
        }),
      }),
    mk("demo-app-7", "Grace Kim", "grace.kim@example.com", PROP.lakeview, "Approved · lease out", "approved",
      "Awaiting signature on lease", {
        signedMonthlyRent: 1700,
        assignedRoomChoice: demoRoomChoice(PROP.lakeview),
        backgroundCheckStatus: "passed",
        application: demoApplicationData({
          propertyId: PROP.lakeview,
          roomChoice1: demoRoomChoice(PROP.lakeview),
          leaseStart: dateLabel(14),
          leaseEnd: dateLabel(379),
        }),
      }),
    mk("demo-app-8", "Tyler Brooks", "tyler.brooks@example.com", PROP.pioneer, "Declined", "rejected",
      "Did not meet income requirement", { backgroundCheckStatus: "flagged" }),
    // Former Pioneer 12A tenant, moved out just before Jordan's incoming lease
    // — gives the manager Residents › Previous tab a real row.
    mk("demo-app-9", "Maya Torres", "maya.torres@example.com", PROP.pioneer, "Moved out", "approved",
      "Lease ended — relocated out of state", {
        signedMonthlyRent: 2300,
        assignedRoomChoice: demoRoomChoice(PROP.pioneer),
        backgroundCheckStatus: "passed",
        manualResidentDetails: {
          moveInDate: dateLabel(-410),
          moveOutDate: dateLabel(-20),
          monthlyUtilities: 85,
          moveInFee: 150,
          securityDeposit: 500,
          roomNumber: "12A",
          leaseTerm: "12 months",
          notes: "Relocated out of state. Deposit returned in full after move-out inspection.",
        },
        application: demoApplicationData({
          propertyId: PROP.pioneer,
          roomChoice1: demoRoomChoice(PROP.pioneer),
          leaseStart: dateLabel(-410),
          leaseEnd: dateLabel(-20),
        }),
      }),
  ];
}

export function demoCharges(): HouseholdCharge[] {
  const mk = (
    id: string,
    residentName: string,
    residentEmail: string,
    propertyId: string,
    amount: number,
    status: "pending" | "paid",
    // Either an overdue/paid rent month, or an explicit upcoming due-date label.
    timing: { rentMonth: string } | { dueDateLabel: string },
    residentUserId: string | null = null,
    extra: Partial<HouseholdCharge> = {},
  ): HouseholdCharge => ({
    id,
    createdAt: isoDaysFromNow(-40),
    residentEmail,
    residentName,
    residentUserId,
    propertyId,
    propertyLabel: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
    managerUserId: DEMO_MANAGER_USER_ID,
    kind: "rent",
    title: "Monthly rent",
    amountLabel: `$${amount.toLocaleString()}.00`,
    balanceLabel: status === "paid" ? "$0.00" : `$${amount.toLocaleString()}.00`,
    status,
    paidAt: status === "paid" ? isoDaysFromNow(-3) : undefined,
    blocksLeaseUntilPaid: false,
    // Listing snapshot: Axis ACH is on for every demo listing, so pending
    // charges show the real pay flow (simulated in the sandbox).
    axisPaymentsEnabledSnapshot: true,
    ...("rentMonth" in timing ? { rentMonth: timing.rentMonth, dueDay: 1 } : { dueDateLabel: timing.dueDateLabel }),
    ...extra,
  });
  return [
    // Overdue (last month, unpaid) — powers "who is late on rent"
    mk("demo-hc-1", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, 3200, "pending", { rentMonth: monthKey(-1) }),
    mk("demo-hc-2", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, 1950, "pending", { rentMonth: monthKey(-1) }),
    // Upcoming (due within a week so the Payments views actually show them).
    // Jordan's first month rent lines up with the lease awaiting signature.
    // `applicationId` is required on every one-time charge below (first month
    // rent, deposit, move-in fee, application fee) — the Payments tab
    // reconciles pending schedules for every approved application on mount
    // (`reconcileApprovedResidentPaymentSchedules`), and without a matching
    // `applicationId` it can't tell an already-paid charge apart from a
    // missing one, so it silently synthesizes a duplicate pending line.
    mk("demo-hc-3", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 2400, "pending", { dueDateLabel: dateLabel(5) }, DEMO_RESIDENT_USER_ID, {
      kind: "first_month_rent",
      title: "First month rent",
      applicationId: "AXIS-DEMOAPP4",
    }),
    mk("demo-hc-4", "Grace Kim", "grace.kim@example.com", PROP.lakeview, 1700, "pending", { dueDateLabel: dateLabel(6) }, null, {
      kind: "first_month_rent",
      title: "First month rent",
      applicationId: "AXIS-DEMOAPP7",
    }),
    // Grace's pre-move-in fees, already paid — mirrors Jordan's paid trail so
    // both incoming residents read the same way before their lease starts.
    mk("demo-hc-14", "Grace Kim", "grace.kim@example.com", PROP.lakeview, 500, "paid", { dueDateLabel: dateLabel(-5) }, null, {
      kind: "security_deposit",
      title: "Security deposit",
      applicationId: "AXIS-DEMOAPP7",
      createdAt: isoDaysFromNow(-8),
      paidAt: isoDaysFromNow(-5),
    }),
    mk("demo-hc-17", "Grace Kim", "grace.kim@example.com", PROP.lakeview, 150, "paid", { dueDateLabel: dateLabel(-5) }, null, {
      kind: "move_in_fee",
      title: "Move-in fee",
      applicationId: "AXIS-DEMOAPP7",
      createdAt: isoDaysFromNow(-8),
      paidAt: isoDaysFromNow(-5),
    }),
    mk("demo-hc-15", "Grace Kim", "grace.kim@example.com", PROP.lakeview, 45, "paid", { dueDateLabel: dateLabel(-22) }, null, {
      kind: "application_fee",
      title: "Application fee",
      applicationId: "AXIS-DEMOAPP7",
      createdAt: isoDaysFromNow(-24),
      paidAt: isoDaysFromNow(-22),
    }),
    // Long-standing active tenants also paid their application fee back when
    // they applied — otherwise the Payments reconcile step above invents a
    // bogus "pending application fee" for an active, fully-signed resident.
    mk("demo-hc-18", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, 45, "paid", { dueDateLabel: dateLabel(-95) }, null, {
      kind: "application_fee",
      title: "Application fee",
      applicationId: "AXIS-DEMOAPP5",
      createdAt: isoDaysFromNow(-97),
      paidAt: isoDaysFromNow(-95),
    }),
    mk("demo-hc-19", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, 45, "paid", { dueDateLabel: dateLabel(-150) }, null, {
      kind: "application_fee",
      title: "Application fee",
      applicationId: "AXIS-DEMOAPP6",
      createdAt: isoDaysFromNow(-152),
      paidAt: isoDaysFromNow(-150),
    }),
    // Former Pioneer tenant's final rent payment before moving out.
    mk("demo-hc-16", "Maya Torres", "maya.torres@example.com", PROP.pioneer, 2300, "paid", { dueDateLabel: dateLabel(-48) }, null, {
      createdAt: isoDaysFromNow(-51),
      paidAt: isoDaysFromNow(-48),
    }),
    // Paid history — the incoming demo resident already paid the move-in
    // charges, so the Paid tab and rent receipts have a real trail.
    mk("demo-hc-5", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 500, "paid", { dueDateLabel: dateLabel(-6) }, DEMO_RESIDENT_USER_ID, {
      kind: "security_deposit",
      title: "Security deposit",
      applicationId: "AXIS-DEMOAPP4",
      createdAt: isoDaysFromNow(-9),
      paidAt: isoDaysFromNow(-6),
    }),
    mk("demo-hc-8", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 150, "paid", { dueDateLabel: dateLabel(-6) }, DEMO_RESIDENT_USER_ID, {
      kind: "move_in_fee",
      title: "Move-in fee",
      applicationId: "AXIS-DEMOAPP4",
      createdAt: isoDaysFromNow(-9),
      paidAt: isoDaysFromNow(-6),
    }),
    // Paid at application time — also stops the portal from synthesizing a
    // pending application-fee line for an approved applicant.
    mk("demo-hc-11", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 45, "paid",
      { dueDateLabel: dateLabel(-24) }, DEMO_RESIDENT_USER_ID, {
        kind: "application_fee",
        title: "Application fee",
        applicationId: "AXIS-DEMOAPP4",
        createdAt: isoDaysFromNow(-26),
        paidAt: isoDaysFromNow(-24),
      }),
    mk("demo-hc-6", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, 3200, "paid", { rentMonth: monthKey(0) }, null, {
      paidAt: isoDaysFromNow(-2),
    }),
    mk("demo-hc-7", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, 1950, "paid", { rentMonth: monthKey(0) }, null, {
      paidAt: isoDaysFromNow(-4),
    }),
  ];
}

export function demoRentProfiles(): RecurringRentProfile[] {
  const mk = (
    email: string,
    name: string,
    propertyId: string,
    rent: number,
    residentUserId: string | null = null,
  ): RecurringRentProfile => ({
    id: `demo-rent-${email}`,
    residentEmail: email,
    residentName: name,
    residentUserId,
    propertyId,
    propertyLabel: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
    roomLabel: "Unit",
    managerUserId: DEMO_MANAGER_USER_ID,
    monthlyRent: rent,
    dueDay: 1,
    startMonth: monthKey(-3),
    active: true,
    updatedAt: isoDaysFromNow(-30),
  });
  return [
    mk(DEMO_RESIDENT_EMAIL, DEMO_RESIDENT_NAME, PROP.pioneer, 2400, DEMO_RESIDENT_USER_ID),
    mk("dana.whitfield@example.com", "Dana Whitfield", PROP.emerald, 3200),
    mk("omar.haddad@example.com", "Omar Haddad", PROP.cascade, 1950),
    mk("grace.kim@example.com", "Grace Kim", PROP.lakeview, 1700),
  ];
}

/**
 * Self-contained lease-agreement HTML for the demo (the panels render it in a
 * sandboxed iframe and append the signature certificate before `</body>`).
 * Kept static — the real generator needs jurisdiction data the demo doesn't have.
 */
export function demoLeaseAgreementHtml(input: {
  residentName: string;
  propertyTitle: string;
  unitLabel: string;
  address: string;
  rentLabel: string;
  startLabel: string;
  endLabel: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Residential Lease Agreement — ${input.propertyTitle} ${input.unitLabel}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1f2430; margin: 48px auto; max-width: 720px; line-height: 1.55; padding: 0 24px; }
  h1 { font-size: 22px; letter-spacing: 0.02em; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #5a6172; font-size: 13px; margin-bottom: 28px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #d8dce4; padding-bottom: 4px; margin-top: 28px; }
  table.facts { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  table.facts td { padding: 6px 8px; border: 1px solid #e2e5ec; }
  table.facts td:first-child { width: 38%; color: #5a6172; }
  p, li { font-size: 14px; }
</style>
</head>
<body>
  <h1>Residential Lease Agreement</h1>
  <p class="subtitle">${input.propertyTitle} · ${input.unitLabel} · ${input.address}, Seattle, WA 98101</p>

  <h2>1. Parties &amp; Premises</h2>
  <p>This Residential Lease Agreement ("Agreement") is entered into between <strong>Axis Housing Management</strong>
  ("Landlord") and <strong>${input.residentName}</strong> ("Resident") for the residential premises located at
  ${input.address}, ${input.unitLabel}, Seattle, WA 98101 (the "Premises").</p>

  <h2>2. Term &amp; Rent</h2>
  <table class="facts">
    <tr><td>Lease start</td><td>${input.startLabel}</td></tr>
    <tr><td>Lease end</td><td>${input.endLabel}</td></tr>
    <tr><td>Monthly rent</td><td>${input.rentLabel}, due on the 1st of each month</td></tr>
    <tr><td>Security deposit</td><td>$500.00, held per RCW 59.18.260</td></tr>
    <tr><td>Late fee</td><td>$50.00 after a 5-day grace period</td></tr>
  </table>

  <h2>3. Utilities &amp; Services</h2>
  <p>Resident is responsible for electricity, internet, and any elective add-on services. Water, sewer, and garbage
  are billed monthly by Landlord alongside rent.</p>

  <h2>4. Maintenance &amp; Repairs</h2>
  <p>Resident shall keep the Premises clean and promptly report needed repairs through the resident portal.
  Landlord will maintain the Premises in compliance with the Washington Residential Landlord-Tenant Act
  (RCW 59.18) and respond to repair requests within a commercially reasonable time.</p>

  <h2>5. House Rules</h2>
  <ul>
    <li>Quiet hours 10:00 PM – 8:00 AM.</li>
    <li>No smoking anywhere on the Premises.</li>
    <li>Pets permitted with prior registration and applicable deposit.</li>
    <li>Guests staying longer than 7 consecutive nights require Landlord approval.</li>
  </ul>

  <h2>6. Entire Agreement</h2>
  <p>This Agreement, together with addenda executed through the Axis portal, constitutes the entire agreement
  between the parties. This is a fictional document generated for the Axis interactive demo.</p>
</body>
</html>`;
}

export function demoLeases(): LeasePipelineRow[] {
  const mk = (
    id: string,
    residentName: string,
    residentEmail: string,
    propertyId: string,
    bucket: LeasePipelineRow["bucket"],
    stageLabel: NonNullable<LeasePipelineRow["status"]>,
    extra: Partial<LeasePipelineRow> = {},
  ): LeasePipelineRow => ({
    id,
    residentName,
    residentEmail,
    unit: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
    stageLabel,
    updated: dateLabel(-2),
    bucket,
    pdfVersion: 1,
    notes: "",
    updatedAtIso: isoDaysFromNow(-2),
    propertyId,
    managerUserId: DEMO_MANAGER_USER_ID,
    status: stageLabel,
    thread: [],
    ...extra,
  });
  const leaseHtml = (residentName: string, propertyId: string, rentLabel: string, startDays: number, endDays: number) => {
    const meta: Record<string, { title: string; unit: string; address: string }> = {
      [PROP.pioneer]: { title: "The Pioneer", unit: "Unit 12A", address: "12 Pike St" },
      [PROP.cascade]: { title: "Cascade Lofts", unit: "Unit 4B", address: "88 Bell St" },
      [PROP.emerald]: { title: "Emerald Court", unit: "Unit 3", address: "455 Boren Ave" },
      [PROP.lakeview]: { title: "Lakeview Flats", unit: "Unit S2", address: "210 Fairview Ave N" },
    };
    const m = meta[propertyId] ?? meta[PROP.pioneer]!;
    return demoLeaseAgreementHtml({
      residentName,
      propertyTitle: m.title,
      unitLabel: m.unit,
      address: m.address,
      rentLabel,
      startLabel: dateLabel(startDays),
      endLabel: dateLabel(endDays),
    });
  };
  const signatures = (
    residentName: string,
    residentSignedDays: number,
    managerSignedDays: number,
  ): Partial<LeasePipelineRow> => ({
    residentSignature: { role: "resident", name: residentName, signedAtIso: isoDaysFromNow(residentSignedDays) },
    managerSignature: { role: "manager", name: DEMO_MANAGER_NAME, signedAtIso: isoDaysFromNow(managerSignedDays) },
    residentSignedAt: isoDaysFromNow(residentSignedDays),
    managerSignedAt: isoDaysFromNow(managerSignedDays),
    fullySignedAt: isoDaysFromNow(managerSignedDays),
  });
  return [
    mk("demo-lease-1", "Grace Kim", "grace.kim@example.com", PROP.lakeview, "resident", "Resident Signature Pending", {
      generatedHtml: leaseHtml("Grace Kim", PROP.lakeview, "$1,700.00 per month", 14, 379),
      generatedAtIso: isoDaysFromNow(-3),
      sentToResidentAt: isoDaysFromNow(-2),
      signedRentLabel: "$1,700/mo",
    }),
    mk("demo-lease-2", "Marcus Chen", "marcus.chen@example.com", PROP.emerald, "admin", "Admin Review", {
      generatedHtml: leaseHtml("Marcus Chen", PROP.emerald, "$3,200.00 per month", 21, 386),
      generatedAtIso: isoDaysFromNow(-1),
    }),
    mk("demo-lease-3", "Priya Sharma", "priya.sharma@example.com", PROP.cascade, "manager", "Manager Review"),
    // The demo resident's lease: ONE shared row both portals act on (the
    // lease store collapses to a single scope in demo). It seeds UNSIGNED but
    // with the generated agreement attached, so the resident Lease tab shows
    // the document immediately (never "being prepared") with signing open —
    // the visitor signs as the resident, toggles roles, and countersigns as
    // the manager to complete it. A page refresh re-seeds and resets the flow.
    mk("demo-lease-4", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, "resident", "Resident Signature Pending", {
      residentUserId: DEMO_RESIDENT_USER_ID,
      generatedHtml: leaseHtml(DEMO_RESIDENT_NAME, PROP.pioneer, "$2,400.00 per month", DEMO_LEASE_START_DAYS, DEMO_LEASE_END_DAYS),
      generatedAtIso: isoDaysFromNow(-3),
      sentToResidentAt: isoDaysFromNow(-2),
      signedRentLabel: "$2,400/mo",
      updated: dateLabel(-2),
      updatedAtIso: isoDaysFromNow(-2),
      application: {
        propertyId: PROP.pioneer,
        roomChoice1: PROP.pioneer,
        leaseStart: dateLabel(DEMO_LEASE_START_DAYS),
        leaseEnd: dateLabel(DEMO_LEASE_END_DAYS),
      },
      thread: [
        {
          id: "demo-lease-4-msg-1",
          at: isoDaysFromNow(-2),
          role: "manager",
          body: "Hi Jordan — your lease is ready. Review and sign when you're ready.",
        },
      ],
    }),
    mk("demo-lease-5", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, "signed", "Fully Signed", {
      generatedHtml: leaseHtml("Dana Whitfield", PROP.emerald, "$3,200.00 per month", -35, 330),
      generatedAtIso: isoDaysFromNow(-40),
      sentToResidentAt: isoDaysFromNow(-39),
      ...signatures("Dana Whitfield", -38, -37),
      signedRentLabel: "$3,200/mo",
    }),
    mk("demo-lease-6", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, "signed", "Fully Signed", {
      generatedHtml: leaseHtml("Omar Haddad", PROP.cascade, "$1,950.00 per month", -90, 275),
      generatedAtIso: isoDaysFromNow(-95),
      sentToResidentAt: isoDaysFromNow(-94),
      ...signatures("Omar Haddad", -92, -91),
      signedRentLabel: "$1,950/mo",
    }),
    // Maya's concluded lease — an explicit row here (matched by email+property)
    // stops the pipeline from synthesizing a fresh "Draft" row for her approved
    // application, which would otherwise misread as an in-progress lease.
    mk("demo-lease-7", "Maya Torres", "maya.torres@example.com", PROP.pioneer, "signed", "Fully Signed", {
      generatedHtml: leaseHtml("Maya Torres", PROP.pioneer, "$2,300.00 per month", -410, -20),
      generatedAtIso: isoDaysFromNow(-410),
      sentToResidentAt: isoDaysFromNow(-409),
      ...signatures("Maya Torres", -408, -407),
      signedRentLabel: "$2,300/mo",
      updated: dateLabel(-20),
      updatedAtIso: isoDaysFromNow(-20),
    }),
  ];
}

export function demoWorkOrders(): DemoManagerWorkOrderRow[] {
  const mk = (
    id: string,
    propertyId: string,
    title: string,
    priority: string,
    status: string,
    bucket: DemoManagerWorkOrderRow["bucket"],
    description: string,
    extra: Partial<DemoManagerWorkOrderRow> = {},
  ): DemoManagerWorkOrderRow => ({
    id,
    propertyName: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
    unit: PROP_LABEL[propertyId]?.split("· ")[1] ?? "12A",
    title,
    priority,
    status,
    bucket,
    description,
    scheduled: "",
    cost: "",
    propertyId,
    managerUserId: DEMO_MANAGER_USER_ID,
    ...extra,
  });
  return [
    mk("demo-wo-1", PROP.pioneer, "Kitchen sink leak", "High", "Open", "open",
      "Resident reports a slow leak under the kitchen sink.", {
        residentName: DEMO_RESIDENT_NAME,
        residentEmail: DEMO_RESIDENT_EMAIL,
        category: "plumbing",
        preferredArrival: "After 5pm weekdays",
      }),
    mk("demo-wo-2", PROP.cascade, "HVAC seasonal tune-up", "Medium", "Scheduled", "scheduled",
      "Annual HVAC maintenance visit.", {
        residentName: "Omar Haddad",
        category: "hvac",
        scheduled: dateLabel(3),
        scheduledAtIso: isoAtTime(3, 10, 0),
        vendorName: DEMO_VENDOR_NAME,
      }),
    // Second scheduled visit for the same vendor — gives the vendor persona's
    // Work Orders + Calendar more than one entry to show.
    mk("demo-wo-5", PROP.lakeview, "Furnace filter replacement", "Low", "Scheduled", "scheduled",
      "Quarterly furnace filter swap ahead of the new resident's move-in.", {
        residentName: "Grace Kim",
        residentEmail: "grace.kim@example.com",
        category: "hvac",
        scheduled: dateLabel(6),
        scheduledAtIso: isoAtTime(6, 13, 30),
        vendorName: DEMO_VENDOR_NAME,
      }),
    mk("demo-wo-3", PROP.emerald, "Repaint living room", "Low", "Completed", "completed",
      "Turn-over repaint before renewal.", {
        residentName: "Dana Whitfield",
        category: "general",
        cost: "$480.00",
        vendorName: "Emerald Painters",
        completedAt: isoDaysFromNow(-6),
        workDoneSummary: "Two-coat repaint, living room + hallway.",
      }),
    mk("demo-wo-4", PROP.lakeview, "Replace smoke detector", "Medium", "Open", "open",
      "Battery warning on hallway smoke detector — flagged during pre-move-in walkthrough.", {
        residentName: "Grace Kim",
        residentEmail: "grace.kim@example.com",
        category: "electrical",
        managerInitiated: true,
      }),
  ];
}

export function demoVendors(): ManagerVendorRow[] {
  const mk = (id: string, name: string, trade: string, phone: string, email: string): ManagerVendorRow => ({
    id,
    managerUserId: DEMO_MANAGER_USER_ID,
    name,
    trade,
    phone,
    email,
    notes: "",
    active: true,
    propertyIds: [],
  });
  return [
    mk("demo-vendor-1", "Cascade Mechanical", "HVAC", "(206) 555-0142", "service@cascademech.example.com"),
    mk("demo-vendor-2", "Rainier Plumbing", "Plumbing", "(206) 555-0177", "dispatch@rainierplumb.example.com"),
    mk("demo-vendor-3", "Emerald Painters", "Painting", "(206) 555-0163", "hello@emeraldpaint.example.com"),
    mk("demo-vendor-4", "Puget Electric", "Electrical", "(206) 555-0189", "team@pugetelectric.example.com"),
  ];
}

export function demoPromotions(): ManagerPromotionRow[] {
  return [
    {
      id: "demo-promo-1",
      managerUserId: DEMO_MANAGER_USER_ID,
      propertyId: PROP.pioneer,
      propertyLabel: "The Pioneer — Pioneer Square",
      title: "Spring leasing push",
      theme: "cobalt",
      flyerSize: "letter",
      status: "generated",
      inputs: {
        headline: "Modern living in Pioneer Square",
        sellingPoints: "In-unit laundry\nRooftop deck\nSteps from light rail",
        price: "$2,400/mo",
        promo: "First month free",
        cta: "Book a tour today",
        contact: "leasing@axis.com · (206) 555-0142",
        tone: "Warm & welcoming",
        customDetails: "",
      },
      copy: {
        headline: "Your Pioneer Square Home Awaits",
        subheadline: "The Pioneer — Pioneer Square · $2,400/mo",
        sellingPoints: ["In-unit laundry", "Private rooftop deck", "Steps from light rail"],
        promoLine: "First month free",
        ctaText: "Book a tour today",
        closingLine: "Contact us: leasing@axis.com · (206) 555-0142",
      },
      createdAt: isoDaysFromNow(-4),
      updatedAt: isoDaysFromNow(-4),
    },
    {
      id: "demo-promo-2",
      managerUserId: DEMO_MANAGER_USER_ID,
      propertyId: PROP.cascade,
      propertyLabel: "Cascade Lofts — Belltown",
      title: "Belltown loft feature",
      theme: "sunset",
      flyerSize: "ig_post",
      template: "bold_banner",
      status: "generated",
      inputs: {
        headline: "Belltown loft living",
        sellingPoints: "Floor-to-ceiling windows\nStainless appliances\nWalk to waterfront",
        price: "$1,950/mo",
        promo: "",
        cta: "Schedule a viewing",
        contact: "leasing@axis.com",
        tone: "Modern & upscale",
        customDetails: "",
      },
      copy: {
        headline: "Loft Living in Belltown",
        subheadline: "Cascade Lofts — Belltown · $1,950/mo",
        sellingPoints: ["Floor-to-ceiling windows", "Stainless appliances", "Walk to the waterfront"],
        promoLine: "",
        ctaText: "Schedule a viewing",
        closingLine: "Contact us: leasing@axis.com",
      },
      createdAt: isoDaysFromNow(-1),
      updatedAt: isoDaysFromNow(-1),
    },
    {
      id: "demo-promo-3",
      managerUserId: DEMO_MANAGER_USER_ID,
      propertyId: PROP.emerald,
      propertyLabel: "Emerald Court — First Hill",
      title: "First Hill family unit (draft)",
      theme: "forest",
      flyerSize: "letter",
      template: "feature_grid",
      status: "draft",
      inputs: {
        headline: "Spacious First Hill 3-bed",
        sellingPoints: "3 bed · 2 bath\nParking included\nQuiet street",
        price: "$3,200/mo",
        promo: "$500 off first month",
        cta: "Apply online",
        contact: "leasing@axis.com",
        tone: "Calm & professional",
        customDetails: "",
      },
      copy: null,
      createdAt: isoDaysFromNow(0),
      updatedAt: isoDaysFromNow(0),
    },
    {
      id: "demo-promo-4",
      managerUserId: DEMO_MANAGER_USER_ID,
      propertyId: PROP.lakeview,
      propertyLabel: "Lakeview Flats — South Lake Union",
      title: "South Lake Union studio",
      theme: "slate",
      flyerSize: "ig_story",
      template: "minimal",
      status: "generated",
      inputs: {
        headline: "Studio living in South Lake Union",
        sellingPoints: "Steps from Amazon campus\nIn-unit laundry\nSecure bike storage",
        price: "$1,700/mo",
        promo: "Waived application fee",
        cta: "Apply today",
        contact: "leasing@axis.com",
        tone: "Clean & minimal",
        customDetails: "",
      },
      copy: {
        headline: "Your South Lake Union Studio",
        subheadline: "Lakeview Flats — South Lake Union · $1,700/mo",
        sellingPoints: ["Steps from Amazon campus", "In-unit laundry", "Secure bike storage"],
        promoLine: "Waived application fee",
        ctaText: "Apply today",
        closingLine: "Contact us: leasing@axis.com",
      },
      createdAt: isoDaysFromNow(-2),
      updatedAt: isoDaysFromNow(-2),
    },
  ];
}

export function demoServiceRequests(): ServiceRequest[] {
  const mk = (
    id: string,
    offerName: string,
    residentName: string,
    residentEmail: string,
    propertyId: string,
    status: ServiceRequest["status"],
    price: string,
    extra: Partial<ServiceRequest> = {},
  ): ServiceRequest => ({
    id,
    offerId: `offer-${id}`,
    offerName,
    offerDescription: "Add-on service booked through the resident portal.",
    price,
    deposit: "",
    residentEmail,
    residentName,
    managerUserId: DEMO_MANAGER_USER_ID,
    propertyId,
    returnByDate: "",
    notes: "",
    requestedAt: isoDaysFromNow(-2),
    status,
    servicePaid: status === "approved",
    depositPaid: false,
    ...extra,
  });
  return [
    mk("demo-sr-1", "Reserved parking spot", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, "pending", "$120.00"),
    mk("demo-sr-2", "Extra storage unit", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, "approved", "$45.00", {
      approvedAt: isoDaysFromNow(-1),
    }),
    mk("demo-sr-3", "Deep-clean visit", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, "denied", "$150.00", {
      requestedAt: isoDaysFromNow(-6),
      deniedAt: isoDaysFromNow(-5),
      managerNote: "Vendor fully booked this month — please re-request next cycle.",
    }),
    mk("demo-sr-4", "Pet registration", "Grace Kim", "grace.kim@example.com", PROP.lakeview, "returned", "$35.00", {
      deposit: "$150.00",
      returnByDate: isoDateOnly(200),
      requestedAt: isoDaysFromNow(-35),
      approvedAt: isoDaysFromNow(-34),
      servicePaid: true,
      servicePaidAt: isoDaysFromNow(-34),
      depositPaid: true,
      depositPaidAt: isoDaysFromNow(-34),
      returnedAt: isoDaysFromNow(-2),
    }),
  ];
}

export function demoManagerInbox(): PersistedInboxThread[] {
  return [
    {
      id: "demo-mi-1",
      folder: "inbox",
      from: "Dana Whitfield",
      email: "dana.whitfield@example.com",
      subject: "Rent payment — running a few days late",
      preview: "Hi Alex, I'll have this month's rent to you by Friday…",
      body: "Hi Alex,\n\nApologies — I'll have this month's rent to you by Friday. Thanks for understanding.\n\nDana",
      time: dateLabel(-1),
      unread: true,
    },
    {
      id: "demo-mi-2",
      folder: "inbox",
      from: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
      subject: "Kitchen sink still leaking",
      preview: "The leak under the sink is getting worse…",
      body: "Hi,\n\nThe leak under the kitchen sink is getting worse. Could someone take a look this week?\n\nThanks,\nJordan",
      time: dateLabel(-1),
      unread: true,
    },
    {
      id: "demo-mi-5",
      folder: "inbox",
      from: "Omar Haddad",
      email: "omar.haddad@example.com",
      subject: "Storage unit — thanks!",
      preview: "Appreciate the quick approval on the storage unit…",
      body: "Hi Alex,\n\nThanks for approving the extra storage unit so quickly — moved my bike gear in this weekend.\n\nOmar",
      time: dateLabel(-2),
      unread: false,
    },
    {
      id: "demo-mi-3",
      folder: "inbox",
      from: "Grace Kim",
      email: "grace.kim@example.com",
      subject: "Signed lease question",
      preview: "Quick question before I sign the lease…",
      body: "Hi Alex,\n\nQuick question before I sign — is the first month prorated? Thanks!\n\nGrace",
      time: dateLabel(-3),
      unread: false,
    },
    {
      id: "demo-mi-4",
      folder: "sent",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Welcome to The Pioneer",
      preview: "Hi Jordan, welcome! Here are your move-in details…",
      body: "Hi Jordan,\n\nWelcome to The Pioneer! Keys will be ready at the office after 3pm on your move-in day.\n\nBest,\nAlex",
      time: dateLabel(-5),
      unread: false,
    },
  ];
}

export function demoResidentInbox(): PersistedInboxThread[] {
  return [
    {
      id: "demo-ri-1",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Welcome to The Pioneer",
      preview: "Hi Jordan, welcome! Here are your move-in details…",
      body: "Hi Jordan,\n\nWelcome to The Pioneer! Keys will be ready at the office after 3pm on your move-in day.\n\nBest,\nAlex",
      time: dateLabel(-5),
      unread: true,
    },
    {
      id: "demo-ri-2",
      folder: "inbox",
      from: "Axis Payments",
      email: "billing@axis.local",
      subject: "Rent receipt — last month",
      preview: "Your payment of $2,400.00 was received. Thank you!",
      body: "Hi Jordan,\n\nWe received your rent payment of $2,400.00. Thank you!\n\nAxis Payments",
      time: dateLabel(-3),
      unread: false,
    },
    {
      id: "demo-ri-3",
      folder: "sent",
      from: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
      subject: "Kitchen sink still leaking",
      preview: "The leak under the sink is getting worse…",
      body: "Hi,\n\nThe leak under the kitchen sink is getting worse. Could someone take a look this week?\n\nThanks,\nJordan",
      time: dateLabel(-1),
      unread: false,
    },
  ];
}

export function demoVendorInbox(): PersistedInboxThread[] {
  return [
    {
      id: "demo-vi-1",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Service visit scheduled — HVAC seasonal tune-up",
      preview: `${PROP_LABEL[PROP.cascade]} · ${dateLabel(3)} at 10:00 AM…`,
      body: `Hi ${DEMO_VENDOR_NAME},\n\nYou're scheduled for the annual HVAC tune-up at ${PROP_LABEL[PROP.cascade]} on ${dateLabel(3)} at 10:00 AM. Resident Omar Haddad will be expecting you.\n\nThanks,\nAlex`,
      time: dateLabel(-1),
      unread: true,
    },
    {
      id: "demo-vi-2",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Service visit scheduled — Furnace filter replacement",
      preview: `${PROP_LABEL[PROP.lakeview]} · ${dateLabel(6)} at 1:30 PM…`,
      body: `Hi ${DEMO_VENDOR_NAME},\n\nQuick one — please swap the furnace filter at ${PROP_LABEL[PROP.lakeview]} on ${dateLabel(6)} at 1:30 PM ahead of the new resident's move-in.\n\nThanks,\nAlex`,
      time: dateLabel(-2),
      unread: false,
    },
  ];
}

export function demoAdminInbox(): InboxMessage[] {
  return [
    {
      id: "demo-ai-1",
      name: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      topic: "Payout schedule question",
      body: "When do Stripe payouts settle for new managers?",
      createdAt: isoDaysFromNow(-1),
      read: false,
      folder: "inbox",
      senderRole: "manager",
      thread: [],
    },
    {
      id: "demo-ai-2",
      name: "Riverside Partners",
      email: "leasing@riverside.example.com",
      topic: "Partner onboarding",
      body: "We'd like to list 40 units on Axis — who can we talk to?",
      createdAt: isoDaysFromNow(-2),
      read: false,
      folder: "inbox",
      senderRole: "partner",
      thread: [],
    },
    {
      id: "demo-ai-3",
      name: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
      topic: "App feedback",
      body: "Love the new payments screen — much clearer!",
      createdAt: isoDaysFromNow(-4),
      read: true,
      folder: "inbox",
      senderRole: "resident",
      thread: [],
    },
  ];
}

export function demoBugFeedback(): PortalBugFeedbackRow[] {
  const mk = (
    id: string,
    type: PortalBugFeedbackRow["type"],
    role: PortalBugFeedbackRow["reporterRole"],
    name: string,
    email: string,
    title: string,
    description: string,
    status: PortalBugFeedbackRow["status"],
    severity: PortalBugFeedbackRow["severity"],
  ): PortalBugFeedbackRow => ({
    id,
    type,
    reporterUserId: "demo-user",
    reporterName: name,
    reporterEmail: email,
    reporterRole: role,
    pageUrl: "/portal/payments",
    title,
    description,
    severity,
    status,
    createdAt: isoDaysFromNow(-5),
    updatedAt: isoDaysFromNow(-2),
  });
  return [
    mk("demo-bf-1", "bug", "manager", DEMO_MANAGER_NAME, DEMO_MANAGER_EMAIL,
      "CSV export missing header row", "When I export payments the header row is blank.", "open", "medium"),
    mk("demo-bf-2", "feedback", "resident", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL,
      "Add autopay", "Would love an autopay toggle for monthly rent.", "reviewing", "low"),
    mk("demo-bf-3", "bug", "manager", "Dana Whitfield", "dana.whitfield@example.com",
      "Calendar timezone off by one", "Tour times show an hour early.", "resolved", "high"),
  ];
}

// --- calendar / tours --------------------------------------------------------

export type DemoScheduleSeed = {
  plannedEvents: PlannedEvent[];
  partnerInquiries: PartnerInquiry[];
  /** Availability slot keys (`YYYY-MM-DD:slotIndex`) per demo property id. */
  availabilityByPropertyId: Record<string, string[]>;
};

/**
 * Confirmed tours, pending tour requests, and manager availability for the demo
 * calendar. Attendees are existing demo applicants so the pipeline reads as one
 * consistent story. All windows are in the near future — past events are
 * filtered out by the calendar store.
 */
export function demoSchedule(): DemoScheduleSeed {
  const tour = (
    id: string,
    attendeeName: string,
    attendeeEmail: string,
    propertyId: string,
    startDays: number,
    startHour: number,
    startMinute = 0,
  ): PlannedEvent => ({
    id,
    title: `Tour — ${attendeeName}`,
    start: isoAtTime(startDays, startHour, startMinute),
    end: isoAtTime(startDays, startHour, startMinute + 30),
    kind: "tour",
    managerUserId: DEMO_MANAGER_USER_ID,
    propertyId,
    propertyTitle: PROP_LABEL[propertyId]?.split(" · ")[0] ?? "The Pioneer",
    attendeeName,
    attendeeEmail,
    notes: "Booked through the public listing page.",
  });
  const request = (
    id: string,
    name: string,
    email: string,
    phone: string,
    propertyId: string,
    windows: Array<{ days: number; hour: number; minute?: number }>,
    notes: string,
  ): PartnerInquiry => {
    const requestedWindows = windows.map((w) => ({
      start: isoAtTime(w.days, w.hour, w.minute ?? 0),
      end: isoAtTime(w.days, w.hour, (w.minute ?? 0) + 30),
    }));
    return {
      id,
      name,
      email,
      phone,
      notes,
      kind: "tour",
      managerUserId: DEMO_MANAGER_USER_ID,
      propertyId,
      propertyTitle: PROP_LABEL[propertyId]?.split(" · ")[0] ?? "The Pioneer",
      requestedWindows,
      proposedStart: requestedWindows[0]!.start,
      proposedEnd: requestedWindows[0]!.end,
      status: "pending",
      createdAt: isoDaysFromNow(-1),
    };
  };
  // Weekday availability, 9:00–17:30 (half-hour slots 18–34), next two weeks.
  const slots: string[] = [];
  for (let day = 0; day <= 13; day += 1) {
    const d = new Date();
    d.setDate(d.getDate() + day);
    const weekday = d.getDay();
    if (weekday === 0 || weekday === 6) continue;
    for (let slot = 18; slot <= 34; slot += 1) slots.push(`${localDateStr(day)}:${slot}`);
  }
  return {
    plannedEvents: [
      tour("demo-tour-1", "Sofia Rossi", "sofia.rossi@example.com", PROP.pioneer, 1, 10, 0),
      tour("demo-tour-2", "Priya Sharma", "priya.sharma@example.com", PROP.cascade, 2, 15, 30),
      tour("demo-tour-3", "Marcus Chen", "marcus.chen@example.com", PROP.emerald, 4, 11, 0),
    ],
    partnerInquiries: [
      request(
        "demo-inq-1",
        "Ava Nguyen",
        "ava.nguyen@example.com",
        "(206) 555-0148",
        PROP.pioneer,
        [
          { days: 2, hour: 17 },
          { days: 3, hour: 9, minute: 30 },
        ],
        "Relocating for work — hoping to tour this week.",
      ),
      request(
        "demo-inq-2",
        "Liam Carter",
        "liam.carter@example.com",
        "(206) 555-0171",
        PROP.lakeview,
        [{ days: 5, hour: 14 }],
        "Interested in the studio; flexible on timing.",
      ),
    ],
    availabilityByPropertyId: {
      [PROP.pioneer]: slots,
      [PROP.cascade]: slots,
      [PROP.emerald]: slots,
      [PROP.lakeview]: slots,
    },
  };
}

// --- finances ----------------------------------------------------------------

export type DemoExpenseRow = {
  id: string;
  date: string;
  category: string;
  scheduleERef: string;
  taxStatus: string;
  amount: string;
  vendor: string;
  memo: string;
  property: string;
};

/** Expense register rows for the manager Finances › Expenses demo report. */
export function demoExpenseRows(): DemoExpenseRow[] {
  const mk = (
    id: string,
    daysAgo: number,
    category: string,
    scheduleERef: string,
    amount: string,
    vendor: string,
    memo: string,
    propertyId: string,
  ): DemoExpenseRow => ({
    id,
    date: isoDateOnly(-daysAgo),
    category,
    scheduleERef,
    taxStatus: "Deductible",
    amount,
    vendor,
    memo,
    property: PROP_LABEL[propertyId] ?? "The Pioneer · 12A",
  });
  return [
    mk("demo-exp-1", 6, "Repairs", "Line 14", "$480.00", "Emerald Painters", "Turn-over repaint — living room + hallway", PROP.emerald),
    mk("demo-exp-2", 9, "Utilities", "Line 17", "$95.00", "Seattle City Light", "Common-area electricity", PROP.pioneer),
    mk("demo-exp-3", 14, "Repairs", "Line 14", "$185.00", "Rainier Plumbing", "Kitchen sink shut-off valve replacement", PROP.cascade),
    mk("demo-exp-4", 25, "Insurance", "Line 9", "$310.00", "Evergreen Mutual", "Quarterly landlord policy premium", PROP.pioneer),
    mk("demo-exp-5", 32, "Cleaning & maintenance", "Line 7", "$140.00", "Sound Cleaning Co.", "Move-out deep clean", PROP.lakeview),
    mk("demo-exp-6", 41, "Repairs", "Line 14", "$220.00", "Cascade Mechanical", "HVAC filter + coil service", PROP.cascade),
    // Larger vendor invoices — push Cascade Mechanical and Emerald Painters
    // over the $600 1099-NEC threshold so the 1099 tab has candidates.
    mk("demo-exp-7", 52, "Repairs", "Line 14", "$1,850.00", "Cascade Mechanical", "Furnace replacement — Unit 4B", PROP.cascade),
    mk("demo-exp-8", 58, "Repairs", "Line 14", "$640.00", "Emerald Painters", "Exterior trim repaint", PROP.emerald),
  ];
}

// --- resident documents --------------------------------------------------------

/**
 * A small, real PDF (generated once with pdf-lib) so the resident's "Other
 * documents" tab has a viewable, downloadable file: a renters-insurance
 * certificate for Jordan Lee. Fictional document for the demo.
 */
const DEMO_INSURANCE_PDF_DATA_URL =
  "data:application/pdf;base64,JVBERi0xLjcKJYGBgYEKCjcgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCA3ODEKPj4Kc3RyZWFtCnicnZbditRAEIXv8xS5Flaru/66QYTdSYIX3gjzAqKrKCuyIj6/p7ozO7gmi7NkJiQ9nfRXp6pOz/1wcxzoZeIRJ41THX9+GV69vb37ffvr68cPVzc/7j5dOdUihbzUMdl4/DxkGY/vhjQSjjR6xofG4/fhtbCoZhWpYviyJFxrJlnEMmkWlTlGMIcxWnHHijtJMsezb8bjt+H4YpiPw/vhvtNxgHHBSeQRXXXJVrJaGVPaBLNiHUzdTD2b46s4Ziw/ubq4WrJDwNjs7DEn2Wxsgc225HkL6gnJMhEV0oqV96DEO9SMpSbASCY7L497vs4Uh1zbghEJJNwdAv1CnOpKYjWT7+LkVaO/EICUsLDEHUY5kDhxRhoD9ib0UUYCoJ1CT4tktBmS2hgUtAR9xYDdRhy/EFcumIWZFwYSYMpsT+hK2gIB4IJFq7EjbgSlUDnCyA+6qkxS8xS1micWIGWAJeYLoYoopUJpX10tsgHl1KqxYuwh2V1doC5AFiuOFjHDrMWmPh41nKcoFdxLqBtZyAVXEBe1OrXczXi3xyw8XC8MqDV8MZSvp+Loq7wdlaa14TtV6xqPSrlwPS1ZzDLzbgtrricBsYxzyNNb1inE6VKi0CBrnjcOyoLsogRRdDguBEywvjAo111AKjuALd/JIs+H6I8nEaMn6JmQXkqpKZHxHqSU1XMOUIxbaS3QnVA4zeo2sf6FdADqMwCrV8augFTu8dlqQhLmg46FtUC23Mzjf+g63y7bE7tIdiqp1qowFtqGYz47pLRqD0+U7pMowNQLMDoZlVKQ69jeCqQOeXsnYr9pO0vrk2b78+qem065FUTEoDlO5VEM5gRnzGYy1u0QUg9BYSwdL7a4wAaehS2d7GT9tUaVuK5bgcU+1Hepfo0AUnt2aWYUJX9obhshSnv70ua2lggXhj1RszyHtclagXg2rK6tW5pBNnm3N9398B3/IqxGjW9Hz3U1YY4d16lXFdZajP2cDGqpmbudndJ7iv3EeU6wncsh9XptBh3vjXc+/uvwB2LSC7MKZW5kc3RyZWFtCmVuZG9iagoKOCAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDYKL0ZpcnN0IDM0Ci9MZW5ndGggNDkxCj4+CnN0cmVhbQp4nNVUS4vcMAy+51fo2B4Wy2+7DAPzSgtl6bJbaGnpIZuYIWWIS+Ip239fOZnpsjspC72VIGJJnyzJn2wOCAKUAgnWgQItBWjg6CQY4NwiLBYF+/jrRwB2U+3DULD3bTPAV8Ii3MK3gm3isUvAi+WyeMRuqlQd4r6YgoBn8Blx08fmWIceFuWuLBEtIhpFYhDFlv4bEk8iSCefcLQmseokZLMSUa7IV05i7BST/SNWn+J39CesyZjthFVu0v/kzbl20x7ipXr8smDXsdlWKcCr7RuBwlCApACh7JfXdBx9qFL8f5sb629j99cOn/Cc6c0k9yHPwMgyuw1DPPY10Z5xZSRPXrwLh58htXV1tY6H5sqid1SsdZ4Gbox7BHirhHFCG0dT+MyXD82h9s5c+jydjDJeoL30WW2FltLMxTmlkTvkc3Fjsc5QQssd3ZGLYrUTyhgh5UyxnFrUQnGrZwpyznnOicG5RrxUygs/079Fx733eqYPIpkaFMaomXRSa+OVO7dINLLPH+6/h3qkJ6u7h/T2LmXeJ0O2XYemrdbxgW480me4AOtFvverrospvwTjG9AlmoCs2dO78GRM8hAU7O54n0Y1G3nB1tUQxvF4dtxUSVfHpu32wD613aob2rPhH7d9Ycff+xVD1AplbmRzdHJlYW0KZW5kb2JqCgo5IDAgb2JqCjw8Ci9TaXplIDEwCi9Sb290IDIgMCBSCi9JbmZvIDMgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9YUmVmCi9MZW5ndGggNDIKL1cgWyAxIDIgMiBdCi9JbmRleCBbIDAgMTAgXQo+PgpzdHJlYW0KeJwVxMERACAIA8ELyIxPqrRFy0OzjwVmgg1OLly65Uo0KM+vLjxr2QOCCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgoxNDYzCiUlRU9G";

/** Resident-uploaded documents seeded into the demo (Documents › Other). */
export function demoResidentUploads(): UploadedOwnLease[] {
  return [
    {
      id: "demo-upload-1",
      fileName: "Renters-insurance-certificate.pdf",
      dataUrl: DEMO_INSURANCE_PDF_DATA_URL,
      uploadedAt: isoDaysFromNow(-20),
    },
  ];
}
