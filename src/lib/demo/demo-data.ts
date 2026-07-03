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
  });
  return [
    base(PROP.pioneer, "The Pioneer", "12 Pike St", "Pioneer Square", 2, 1, 2400, "Unit 12A"),
    base(PROP.cascade, "Cascade Lofts", "88 Bell St", "Belltown", 1, 1, 1950, "Unit 4B"),
    base(PROP.emerald, "Emerald Court", "455 Boren Ave", "First Hill", 3, 2, 3200, "Unit 3"),
    base(PROP.lakeview, "Lakeview Flats", "210 Fairview Ave N", "South Lake Union", 0, 1, 1700, "Unit S2"),
  ];
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
      "Applied 2 days ago · credit check in progress", { backgroundCheckStatus: "pending_review" }),
    mk("demo-app-2", "Marcus Chen", "marcus.chen@example.com", PROP.emerald, "New application", "pending",
      "Submitted application, awaiting first review"),
    mk("demo-app-3", "Sofia Rossi", "sofia.rossi@example.com", PROP.pioneer, "Documents requested", "pending",
      "Income verification requested"),
    mk("demo-app-4", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, "Approved · lease sent", "approved",
      "Move-in scheduled", {
        signedMonthlyRent: 2400,
        assignedRoomChoice: "Unit 12A",
        backgroundCheckStatus: "passed",
        moveInInstructions: "Keys available at the Pioneer Square office after 3pm on move-in day.",
      }),
    mk("demo-app-5", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, "Approved · active", "approved",
      "Long-term resident since last year", {
        signedMonthlyRent: 3200,
        assignedRoomChoice: "Unit 3",
        backgroundCheckStatus: "passed",
      }),
    mk("demo-app-6", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, "Approved · active", "approved",
      "Renewed lease this spring", {
        signedMonthlyRent: 1950,
        assignedRoomChoice: "Unit 4B",
        backgroundCheckStatus: "passed",
      }),
    mk("demo-app-7", "Grace Kim", "grace.kim@example.com", PROP.lakeview, "Approved · lease out", "approved",
      "Awaiting signature on lease", {
        signedMonthlyRent: 1700,
        assignedRoomChoice: "Unit S2",
        backgroundCheckStatus: "passed",
      }),
    mk("demo-app-8", "Tyler Brooks", "tyler.brooks@example.com", PROP.pioneer, "Declined", "rejected",
      "Did not meet income requirement", { backgroundCheckStatus: "flagged" }),
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
    ...("rentMonth" in timing ? { rentMonth: timing.rentMonth, dueDay: 1 } : { dueDateLabel: timing.dueDateLabel }),
  });
  return [
    // Overdue (last month, unpaid) — powers "who is late on rent"
    mk("demo-hc-1", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, 3200, "pending", { rentMonth: monthKey(-1) }),
    mk("demo-hc-2", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, 1950, "pending", { rentMonth: monthKey(-1) }),
    // Upcoming (due in the next couple weeks, not overdue)
    mk("demo-hc-3", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 2400, "pending", { dueDateLabel: dateLabel(9) }, DEMO_RESIDENT_USER_ID),
    mk("demo-hc-4", "Grace Kim", "grace.kim@example.com", PROP.lakeview, 1700, "pending", { dueDateLabel: dateLabel(12) }),
    // Paid history
    mk("demo-hc-5", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, 2400, "paid", { rentMonth: monthKey(0) }, DEMO_RESIDENT_USER_ID),
    mk("demo-hc-6", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, 3200, "paid", { rentMonth: monthKey(0) }),
    mk("demo-hc-7", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, 1950, "paid", { rentMonth: monthKey(0) }),
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

export function demoLeases(): LeasePipelineRow[] {
  const mk = (
    id: string,
    residentName: string,
    residentEmail: string,
    propertyId: string,
    bucket: LeasePipelineRow["bucket"],
    stageLabel: NonNullable<LeasePipelineRow["status"]>,
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
  });
  return [
    mk("demo-lease-1", "Grace Kim", "grace.kim@example.com", PROP.lakeview, "resident", "Resident Signature Pending"),
    mk("demo-lease-2", "Marcus Chen", "marcus.chen@example.com", PROP.emerald, "admin", "Admin Review"),
    mk("demo-lease-3", "Priya Sharma", "priya.sharma@example.com", PROP.cascade, "manager", "Manager Review"),
    mk("demo-lease-4", DEMO_RESIDENT_NAME, DEMO_RESIDENT_EMAIL, PROP.pioneer, "resident", "Resident Signature Pending"),
    mk("demo-lease-5", "Dana Whitfield", "dana.whitfield@example.com", PROP.emerald, "signed", "Fully Signed"),
    mk("demo-lease-6", "Omar Haddad", "omar.haddad@example.com", PROP.cascade, "signed", "Fully Signed"),
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
        scheduledAtIso: isoDaysFromNow(3),
        vendorName: "Cascade Mechanical",
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
      "Battery warning on hallway smoke detector.", { category: "electrical", managerInitiated: true }),
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
