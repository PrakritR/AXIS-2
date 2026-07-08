/**
 * Demo data snapshots for idle vs guided tour steps.
 *
 * `buildDemoIdleSnapshot` — empty portfolio (default `/demo` explore mode).
 * `buildDemoGuidedSnapshot` — cumulative story data through the given step;
 * step 0 is empty, step 1 is one property, and so on through step 11.
 */
import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { PortalBugFeedbackRow } from "@/lib/portal-bug-feedback";
import type { InboxMessage } from "@/lib/demo-admin-partner-inbox";
import type { UploadedOwnLease } from "@/lib/resident-lease-upload";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import type { VendorPayout } from "@/lib/vendor-payouts";
import type { GuidedDemoStep } from "@/lib/demo/demo-guided";
import {
  DEMO_LEASE_END_DAYS,
  DEMO_LEASE_START_DAYS,
  DEMO_MANAGER_EMAIL,
  DEMO_MANAGER_NAME,
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_EMAIL,
  DEMO_RESIDENT_NAME,
  DEMO_RESIDENT_USER_ID,
  DEMO_VENDOR_NAME,
  DEMO_VENDOR_USER_ID,
  PROP,
  PROP_LABEL,
  dateLabel,
  demoAdminInbox,
  demoApplications,
  demoBugFeedback,
  demoCharges,
  demoExpenseRows,
  demoLeases,
  demoLeaseAgreementHtml,
  demoManagerInbox,
  demoPromotions,
  demoProperties,
  demoResidentInbox,
  demoResidentUploads,
  demoRentProfiles,
  demoSchedule,
  demoServiceRequests,
  demoVendorInbox,
  demoVendors,
  demoVendorPayouts,
  demoWorkOrderBids,
  demoWorkOrders,
  demoRoomChoice,
  isoDaysFromNow,
  isoAtTime,
} from "@/lib/demo/demo-data";
import type { DemoScheduleSeed } from "@/lib/demo/demo-data";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export type DemoDataSnapshot = {
  properties: MockProperty[];
  applications: DemoApplicantRow[];
  charges: HouseholdCharge[];
  rentProfiles: RecurringRentProfile[];
  leases: LeasePipelineRow[];
  workOrders: DemoManagerWorkOrderRow[];
  workOrderBids: WorkOrderBid[];
  vendorPayouts: VendorPayout[];
  vendors: ManagerVendorRow[];
  promotions: ManagerPromotionRow[];
  serviceRequests: ServiceRequest[];
  managerInbox: PersistedInboxThread[];
  residentInbox: PersistedInboxThread[];
  vendorInbox: PersistedInboxThread[];
  adminInbox: InboxMessage[];
  bugFeedback: PortalBugFeedbackRow[];
  schedule: DemoScheduleSeed;
  residentUploads: UploadedOwnLease[];
};

function emptySchedule(): DemoScheduleSeed {
  return { plannedEvents: [], partnerInquiries: [], availabilityByPropertyId: {} };
}

function emptySnapshot(): DemoDataSnapshot {
  return {
    properties: [],
    applications: [],
    charges: [],
    rentProfiles: [],
    leases: [],
    workOrders: [],
    workOrderBids: [],
    vendorPayouts: [],
    vendors: [],
    promotions: [],
    serviceRequests: [],
    managerInbox: [],
    residentInbox: [],
    vendorInbox: [],
    adminInbox: [],
    bugFeedback: [],
    schedule: emptySchedule(),
    residentUploads: [],
  };
}

/** Guided tour / Run demo — blank slate before autoplay creates a property. */
export function buildDemoBlankSnapshot(): DemoDataSnapshot {
  return emptySnapshot();
}

/** Idle explore mode — rich cross-portal portfolio (static seed + mirror base). */
export function buildDemoIdleSnapshot(): DemoDataSnapshot {
  return {
    properties: demoProperties(),
    applications: demoApplications(),
    charges: demoCharges(),
    rentProfiles: demoRentProfiles(),
    leases: demoLeases(),
    workOrders: demoWorkOrders(),
    workOrderBids: demoWorkOrderBids(),
    vendorPayouts: demoVendorPayouts(),
    vendors: demoVendors(),
    promotions: demoPromotions(),
    serviceRequests: demoServiceRequests(),
    managerInbox: demoManagerInbox(),
    residentInbox: demoResidentInbox(),
    vendorInbox: demoVendorInbox(),
    adminInbox: demoAdminInbox(),
    bugFeedback: demoBugFeedback(),
    schedule: demoSchedule(),
    residentUploads: demoResidentUploads(),
  };
}

const GUIDED_APP_ID = "AXIS-GUIDEDAPP1";

function demoApplicationData(input: Partial<RentalWizardFormState>): RentalWizardFormState {
  return input as RentalWizardFormState;
}

function guidedPioneerProperty(): MockProperty {
  return demoProperties().find((p) => p.id === PROP.pioneer)!;
}

function guidedJordanApplicationPending(): DemoApplicantRow {
  return {
    id: GUIDED_APP_ID,
    name: DEMO_RESIDENT_NAME,
    email: DEMO_RESIDENT_EMAIL,
    property: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
    propertyId: PROP.pioneer,
    assignedPropertyId: PROP.pioneer,
    stage: "New application",
    bucket: "pending",
    detail: "Submitted application — awaiting manager review",
    managerUserId: DEMO_MANAGER_USER_ID,
    application: demoApplicationData({
      propertyId: PROP.pioneer,
      fullLegalName: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
      roomChoice1: demoRoomChoice(PROP.pioneer),
      ssn: "123-45-6784",
      consentCredit: true,
    }),
  };
}

function guidedJordanApplicationApproved(): DemoApplicantRow {
  return {
    ...guidedJordanApplicationPending(),
    stage: "Approved · lease sent",
    bucket: "approved",
    detail: "Lease sent — awaiting signature",
    signedMonthlyRent: 2400,
    assignedRoomChoice: demoRoomChoice(PROP.pioneer),
    backgroundCheckStatus: "passed",
    moveInInstructions: "Keys available at the Pioneer Square office after 3pm on move-in day.",
    application: demoApplicationData({
      propertyId: PROP.pioneer,
      roomChoice1: demoRoomChoice(PROP.pioneer),
      leaseStart: dateLabel(DEMO_LEASE_START_DAYS),
      leaseEnd: dateLabel(DEMO_LEASE_END_DAYS),
      fullLegalName: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
    }),
  };
}

function guidedJordanLeaseUnsigned(): LeasePipelineRow {
  const pioneer = demoProperties().find((p) => p.id === PROP.pioneer);
  const sub = pioneer?.listingSubmission?.v === 1 ? pioneer.listingSubmission : null;
  const leaseHtml = demoLeaseAgreementHtml({
    residentName: DEMO_RESIDENT_NAME,
    propertyTitle: sub?.buildingName ?? "The Pioneer",
    unitLabel: "Unit 12A",
    address: sub?.address ?? "12 Pike St, Seattle, WA",
    cityStateZip: sub?.zip ? `Seattle, WA ${sub.zip}` : "Seattle, WA 98101",
    rentLabel: "$2,400.00 per month",
    startLabel: dateLabel(DEMO_LEASE_START_DAYS),
    endLabel: dateLabel(DEMO_LEASE_END_DAYS),
    leaseTermLabel: "12-Month",
    securityDeposit: sub?.securityDeposit,
    moveInFee: sub?.moveInFee,
    utilitiesLabel: sub?.rooms[0]?.utilitiesEstimate
      ? `${sub.rooms[0].utilitiesEstimate} / month estimated`
      : undefined,
    houseRules: sub?.houseRulesText,
    houseOverview: sub?.houseOverview,
    amenitiesText: sub?.amenitiesText,
    parkingLabel: sub?.parkingMonthly?.trim()
      ? `${sub.parkingMonthly}/month reserved parking available on the listing`
      : undefined,
    petPolicyLabel: sub?.petFriendly
      ? "Pets may be permitted subject to prior written approval, pet registration, and applicable deposit."
      : undefined,
  });
  return {
    id: "demo-lease-guided",
    residentName: DEMO_RESIDENT_NAME,
    residentEmail: DEMO_RESIDENT_EMAIL,
    unit: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
    stageLabel: "Resident Signature Pending",
    updated: dateLabel(-1),
    bucket: "resident",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: isoDaysFromNow(-1),
    propertyId: PROP.pioneer,
    managerUserId: DEMO_MANAGER_USER_ID,
    status: "Resident Signature Pending",
    residentUserId: DEMO_RESIDENT_USER_ID,
    generatedHtml: leaseHtml,
    generatedAtIso: isoDaysFromNow(-2),
    sentToResidentAt: isoDaysFromNow(-1),
    signedRentLabel: "$2,400/mo",
    thread: [
      {
        id: "demo-lease-guided-msg-1",
        at: isoDaysFromNow(-1),
        role: "manager",
        body: "Hi Jordan — your lease is ready. Review and sign when you're ready.",
      },
    ],
    application: {
      propertyId: PROP.pioneer,
      roomChoice1: demoRoomChoice(PROP.pioneer),
      leaseStart: dateLabel(DEMO_LEASE_START_DAYS),
      leaseEnd: dateLabel(DEMO_LEASE_END_DAYS),
    },
  };
}

function guidedJordanLeaseSigned(): LeasePipelineRow {
  return {
    ...guidedJordanLeaseUnsigned(),
    bucket: "signed",
    stageLabel: "Fully Signed",
    status: "Fully Signed",
    residentSignature: { role: "resident", name: DEMO_RESIDENT_NAME, signedAtIso: isoDaysFromNow(-1) },
    managerSignature: { role: "manager", name: DEMO_MANAGER_NAME, signedAtIso: isoDaysFromNow(0) },
    residentSignedAt: isoDaysFromNow(-1),
    managerSignedAt: isoDaysFromNow(0),
    fullySignedAt: isoDaysFromNow(0),
  };
}

function guidedMoveInChargesPaid(): HouseholdCharge[] {
  return [
    {
      id: "demo-hc-guided-deposit",
      createdAt: isoDaysFromNow(-5),
      residentEmail: DEMO_RESIDENT_EMAIL,
      residentName: DEMO_RESIDENT_NAME,
      residentUserId: DEMO_RESIDENT_USER_ID,
      propertyId: PROP.pioneer,
      propertyLabel: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
      managerUserId: DEMO_MANAGER_USER_ID,
      kind: "security_deposit",
      title: "Security deposit",
      amountLabel: "$500.00",
      balanceLabel: "$0.00",
      status: "paid",
      paidAt: isoDaysFromNow(-4),
      blocksLeaseUntilPaid: false,
      axisPaymentsEnabledSnapshot: true,
      dueDateLabel: dateLabel(-4),
      applicationId: GUIDED_APP_ID,
    },
    {
      id: "demo-hc-guided-movein",
      createdAt: isoDaysFromNow(-5),
      residentEmail: DEMO_RESIDENT_EMAIL,
      residentName: DEMO_RESIDENT_NAME,
      residentUserId: DEMO_RESIDENT_USER_ID,
      propertyId: PROP.pioneer,
      propertyLabel: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
      managerUserId: DEMO_MANAGER_USER_ID,
      kind: "move_in_fee",
      title: "Move-in fee",
      amountLabel: "$150.00",
      balanceLabel: "$0.00",
      status: "paid",
      paidAt: isoDaysFromNow(-4),
      blocksLeaseUntilPaid: false,
      axisPaymentsEnabledSnapshot: true,
      dueDateLabel: dateLabel(-4),
      applicationId: GUIDED_APP_ID,
    },
    {
      id: "demo-hc-guided-appfee",
      createdAt: isoDaysFromNow(-8),
      residentEmail: DEMO_RESIDENT_EMAIL,
      residentName: DEMO_RESIDENT_NAME,
      residentUserId: DEMO_RESIDENT_USER_ID,
      propertyId: PROP.pioneer,
      propertyLabel: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
      managerUserId: DEMO_MANAGER_USER_ID,
      kind: "application_fee",
      title: "Application fee",
      amountLabel: "$45.00",
      balanceLabel: "$0.00",
      status: "paid",
      paidAt: isoDaysFromNow(-7),
      blocksLeaseUntilPaid: false,
      axisPaymentsEnabledSnapshot: true,
      dueDateLabel: dateLabel(-7),
      applicationId: GUIDED_APP_ID,
    },
  ];
}

function guidedFirstMonthRentPending(): HouseholdCharge {
  return {
    id: "demo-hc-guided-rent",
    createdAt: isoDaysFromNow(-2),
    residentEmail: DEMO_RESIDENT_EMAIL,
    residentName: DEMO_RESIDENT_NAME,
    residentUserId: DEMO_RESIDENT_USER_ID,
    propertyId: PROP.pioneer,
    propertyLabel: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
    managerUserId: DEMO_MANAGER_USER_ID,
    kind: "first_month_rent",
    title: "First month rent",
    amountLabel: "$2,400.00",
    balanceLabel: "$2,400.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    axisPaymentsEnabledSnapshot: true,
    dueDateLabel: dateLabel(3),
    applicationId: GUIDED_APP_ID,
  };
}

function guidedFirstMonthRentPaid(): HouseholdCharge {
  return { ...guidedFirstMonthRentPending(), status: "paid", balanceLabel: "$0.00", paidAt: isoDaysFromNow(-1) };
}

function guidedKitchenSinkWorkOrder(): DemoManagerWorkOrderRow {
  return {
    id: "demo-wo-guided",
    propertyName: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
    unit: "12A",
    title: "Kitchen sink leak",
    priority: "High",
    status: "Open",
    bucket: "open",
    description: "Resident reports a slow leak under the kitchen sink.",
    scheduled: "",
    cost: "",
    propertyId: PROP.pioneer,
    managerUserId: DEMO_MANAGER_USER_ID,
    residentName: DEMO_RESIDENT_NAME,
    residentEmail: DEMO_RESIDENT_EMAIL,
    category: "plumbing",
    preferredArrival: "After 5pm weekdays",
  };
}

function guidedVendorAssignedWorkOrder(): DemoManagerWorkOrderRow {
  return {
    ...guidedKitchenSinkWorkOrder(),
    status: "Scheduled",
    bucket: "scheduled",
    scheduled: dateLabel(2),
    scheduledAtIso: isoAtTime(2, 14, 0),
    vendorName: DEMO_VENDOR_NAME,
    vendorId: "demo-vendor-1",
    biddingOpen: true,
    biddingOpenedAt: isoDaysFromNow(-1),
  };
}

function guidedMiniSplitCompleted(): DemoManagerWorkOrderRow {
  return {
    id: "demo-wo-guided-mini",
    propertyName: PROP_LABEL[PROP.pioneer] ?? "The Pioneer · 12A",
    unit: "12A",
    title: "Mini-split head cleaning",
    priority: "Low",
    status: "Completed",
    bucket: "completed",
    description: "Deep clean of wall-mounted head.",
    scheduled: dateLabel(-3),
    cost: "$175.00",
    propertyId: PROP.pioneer,
    managerUserId: DEMO_MANAGER_USER_ID,
    residentName: DEMO_RESIDENT_NAME,
    residentEmail: DEMO_RESIDENT_EMAIL,
    category: "hvac",
    vendorName: DEMO_VENDOR_NAME,
    vendorId: "demo-vendor-1",
    vendorCostCents: 17500,
    automationStatus: "vendor_marked_done",
    vendorMarkedDoneAt: isoDaysFromNow(-2),
    completedAt: isoDaysFromNow(-2),
  };
}

function guidedCascadeVendor(): ManagerVendorRow {
  return demoVendors().find((v) => v.id === "demo-vendor-1")!;
}

function guidedVendorBid(): WorkOrderBid {
  return {
    id: "demo-bid-guided",
    workOrderId: "demo-wo-guided-mini",
    vendorUserId: DEMO_VENDOR_USER_ID,
    vendorDirectoryId: "demo-vendor-1",
    vendorName: DEMO_VENDOR_NAME,
    quoteMode: "upfront",
    consultationVisitAt: null,
    amountCents: 17500,
    materialsCents: 0,
    proposedTime: isoAtTime(-2, 11, 0),
    note: "Standard head cleaning and filter service.",
    status: "submitted",
    createdAt: isoDaysFromNow(-3),
    updatedAt: isoDaysFromNow(-2),
  };
}

function guidedManagerInboxStep3(): PersistedInboxThread[] {
  return [
    {
      id: "demo-mi-guided-1",
      folder: "inbox",
      from: DEMO_RESIDENT_NAME,
      email: DEMO_RESIDENT_EMAIL,
      subject: "Application submitted — The Pioneer",
      preview: "Hi Alex, I just submitted my application…",
      body: "Hi Alex,\n\nI just submitted my application for The Pioneer. Let me know if you need anything else!\n\nJordan",
      time: dateLabel(0),
      unread: true,
    },
  ];
}

function guidedResidentInboxStep4(): PersistedInboxThread[] {
  return [
    {
      id: "demo-ri-guided-1",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Your lease is ready to sign",
      preview: "Hi Jordan, your lease for The Pioneer is ready…",
      body: "Hi Jordan,\n\nYour lease for The Pioneer is ready for review and signature in the resident portal.\n\nBest,\nAlex",
      time: dateLabel(-1),
      unread: true,
    },
  ];
}

function guidedVendorInboxStep10(): PersistedInboxThread[] {
  return [
    {
      id: "demo-vi-guided-1",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Bid request — mini-split head cleaning",
      preview: `${PROP_LABEL[PROP.pioneer]} · cleaning visit…`,
      body: `Hi ${DEMO_VENDOR_NAME},\n\nPlease submit pricing for a mini-split head cleaning at ${PROP_LABEL[PROP.pioneer]}.\n\nThanks,\nAlex`,
      time: dateLabel(-2),
      unread: true,
    },
    {
      id: "demo-vi-guided-2",
      folder: "inbox",
      from: DEMO_MANAGER_NAME,
      email: DEMO_MANAGER_EMAIL,
      subject: "Work marked done — awaiting approval",
      preview: "Your $175.00 invoice is pending manager approval…",
      body: `Hi ${DEMO_VENDOR_NAME},\n\nThe mini-split cleaning at ${PROP_LABEL[PROP.pioneer]} is marked done. $175.00 labor is awaiting manager payout approval.\n\nThanks,\nAlex`,
      time: dateLabel(-1),
      unread: true,
    },
  ];
}

/**
 * Cumulative guided-story data — simplified demo only seeds empty portfolio;
 * the autoplay creates the property through the real wizard.
 */
export function buildDemoGuidedDataThrough(_through: number): DemoDataSnapshot {
  return buildDemoBlankSnapshot();
}

/** Data for the current guided step — always empty at tour start. */
export function buildDemoGuidedSnapshot(_step: GuidedDemoStep): DemoDataSnapshot {
  return buildDemoBlankSnapshot();
}
