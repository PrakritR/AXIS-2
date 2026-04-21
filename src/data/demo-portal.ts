/**
 * Portal UI types and empty tables. Listing inventory stays in `mock-properties` + demo pipeline.
 * Wire Supabase queries into portal panels to replace these empty arrays.
 */

import type { RentalWizardFormState } from "@/lib/rental-application/types";
import {
  snapshotAlexChenApplicant,
  snapshotJordanLee,
  snapshotPriyaNair,
  snapshotSamRivera,
} from "@/data/manager-application-snapshots";

export const demoKpis = {
  applications: { pending: "2", approved: "2", rejected: "1" },
  leases: { managerReview: "0", adminReview: "0", withResident: "0", signed: "0" },
  payments: { pending: "4", overdue: "2", paid: "3" },
  workOrders: { open: "2", scheduled: "1", completed: "2" },
  managers: { current: "0", past: "0" },
  calendar: { today: "0", week: "0", month: "0", total: "0" },
} as const;

export type DemoOwnerAccountRow = {
  id: string;
  name: string;
  email: string;
  properties: string;
  active: boolean;
};

export const demoOwnerAccounts: DemoOwnerAccountRow[] = [
  {
    id: "owner_demo_1",
    name: "Harbor Holdings LLC",
    email: "harbor.owner@example.com",
    properties: "Demo Building",
    active: true,
  },
];

export const demoOwnerPropertyCards: { name: string; units: string; access: string; manager: string }[] = [
  { name: "Demo Building", units: "24 units", access: "Manager portal", manager: "Demo Property Management" },
];

export type ManagerApplicationBucket = "pending" | "approved" | "rejected";

export type DemoApplicantRow = {
  id: string;
  name: string;
  property: string;
  stage: string;
  score: string;
  bucket: ManagerApplicationBucket;
  email?: string;
  /** Manager-facing notes (shown under full application in Details). */
  detail: string;
  /** Saved answers as on the rental application review step (demo). */
  application?: RentalWizardFormState;
};

export const demoApplicantRows: DemoApplicantRow[] = [
  {
    id: "app_demo_1",
    name: "Jordan Lee",
    property: "Pioneer Collective · Room 12A",
    stage: "Screening",
    score: "82",
    bucket: "pending",
    email: "jordan.lee@example.com",
    detail:
      "Income verified at 3.2× rent. Pet deposit noted. References requested from prior landlord; credit check in progress.",
    application: snapshotJordanLee(),
  },
  {
    id: "app_demo_2",
    name: "Sam Rivera",
    property: "Lakeview · Micro-studio",
    stage: "Documents",
    score: "76",
    bucket: "pending",
    email: "sam.rivera@example.com",
    detail: "ID and pay stubs uploaded. Awaiting employer verification link.",
    application: snapshotSamRivera(),
  },
  {
    id: "app_demo_3",
    name: "Alex Chen",
    property: "Demo Building · 2A",
    stage: "Approved",
    score: "88",
    bucket: "approved",
    email: "alex.chen@example.com",
    detail: "Strong income; approved Mar 28. Lease packet sent.",
    application: snapshotAlexChenApplicant(),
  },
  {
    id: "app_demo_4",
    name: "Priya Nair",
    property: "Demo Building · 1C",
    stage: "Approved",
    score: "91",
    bucket: "approved",
    email: "priya.nair@example.com",
    detail: "Approved after reference check. Holding unit per manager notes.",
    application: snapshotPriyaNair(),
  },
  {
    id: "app_demo_5",
    name: "Casey Kim",
    property: "Pioneer Collective · Room 8B",
    stage: "Rejected",
    score: "54",
    bucket: "rejected",
    email: "casey.kim@example.com",
    detail: "Income below 2.5× rent threshold; denial letter emailed (demo).",
  },
];

export const demoPaymentRows: { resident: string; unit: string; amount: string; due: string; status: string }[] = [];

export const demoWorkOrderRows: { id: string; unit: string; title: string; priority: string; status: string }[] = [];

export const demoInboxPreviewRows: {
  from: string;
  subject: string;
  preview: string;
  when: string;
  unread: string;
}[] = [];

export const demoAdminPropertyRows: { name: string; manager: string; units: string; status: string }[] = [];

export const demoManagerSubscriberRows: { name: string; org: string; portfolio: string; status: string; since: string }[] =
  [];

export const demoLeasePipelineRows: { resident: string; unit: string; stage: string; updated: string }[] = [
  { resident: "Alex Chen", unit: "Demo Building · 2A", stage: "With resident", updated: "Apr 12" },
  { resident: "Jordan Lee", unit: "Pioneer Collective · 12A", stage: "Manager review", updated: "Apr 14" },
];

export const demoResidentPropertyRows: { building: string; unit: string; manager: string; since: string }[] = [
  { building: "Demo Building", unit: "2A", manager: "Demo Property Management", since: "Jan 2025" },
];

export const demoResidentLeaseRows: { document: string; status: string; updated: string }[] = [];

/** Manager Properties panel */
export type ManagerHouseBucket = "pending" | "change" | "listed" | "unlisted" | "rejected";

export type DemoManagerHouseRow = {
  id: string;
  name: string;
  address: string;
  propertyType: string;
  roomCount: number;
  bathCount: number;
  appFee: string;
  bucket: ManagerHouseBucket;
  detail: string;
};

/** Static fallback before session pipeline loads; aligns with seeded admin-approved listing in `ensureDemoManagerPipelineSeed`. */
export const demoManagerHouseRows: DemoManagerHouseRow[] = [
  {
    id: "house_market_studios",
    name: "Market Street Studios",
    address: "188 Minna St, San Francisco, CA",
    propertyType: "Studio building",
    roomCount: 1,
    bathCount: 1,
    appFee: "$45",
    bucket: "listed",
    detail: "Live listing shown after admin approval (demo seed).",
  },
];

export type ManagerPaymentBucket = "pending" | "overdue" | "paid";

export type DemoManagerPaymentLedgerRow = {
  id: string;
  propertyName: string;
  roomNumber: string;
  residentName: string;
  chargeTitle: string;
  lineAmount: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string;
  bucket: ManagerPaymentBucket;
  statusLabel: string;
  notes: string;
  /** When set, row comes from `household-charges` and Mark paid updates that record. */
  householdChargeId?: string;
};

export const demoManagerPaymentLedgerRows: DemoManagerPaymentLedgerRow[] = [
  {
    id: "pay_demo_pending_1",
    propertyName: "Demo Building",
    roomNumber: "2A",
    residentName: "Alex Chen",
    chargeTitle: "April rent",
    lineAmount: "$1,850.00",
    amountPaid: "$0.00",
    balanceDue: "$1,850.00",
    dueDate: "May 1",
    bucket: "pending",
    statusLabel: "Due soon",
    notes: "Autopay off — resident pays via Zelle per lease.",
  },
  {
    id: "pay_demo_pending_2",
    propertyName: "Pioneer Collective",
    roomNumber: "12A",
    residentName: "Jordan Lee",
    chargeTitle: "Application fee",
    lineAmount: "$40.00",
    amountPaid: "$0.00",
    balanceDue: "$40.00",
    dueDate: "Apr 25",
    bucket: "pending",
    statusLabel: "Pending",
    notes: "Waivable with promo on apply flow; listed here for manager QA.",
  },
  {
    id: "pay_demo_overdue_1",
    propertyName: "Demo Building",
    roomNumber: "1C",
    residentName: "Priya Nair",
    chargeTitle: "March utilities reconciliation",
    lineAmount: "$124.50",
    amountPaid: "$0.00",
    balanceDue: "$124.50",
    dueDate: "Apr 5",
    bucket: "overdue",
    statusLabel: "Overdue",
    notes: "Demo overdue line — follow up or mark paid when received.",
  },
  {
    id: "pay_demo_overdue_2",
    propertyName: "Pioneer Collective",
    roomNumber: "8B",
    residentName: "Taylor Brooks",
    chargeTitle: "Parking (monthly)",
    lineAmount: "$175.00",
    amountPaid: "$50.00",
    balanceDue: "$125.00",
    dueDate: "Apr 1",
    bucket: "overdue",
    statusLabel: "Partial",
    notes: "Partial payment logged; remainder overdue (demo).",
  },
  {
    id: "pay_demo_paid_1",
    propertyName: "Demo Building",
    roomNumber: "3B",
    residentName: "Sam Rivera",
    chargeTitle: "April rent",
    lineAmount: "$1,695.00",
    amountPaid: "$1,695.00",
    balanceDue: "$0.00",
    dueDate: "Apr 1",
    bucket: "paid",
    statusLabel: "Paid",
    notes: "Marked paid Apr 2 via Zelle.",
  },
  {
    id: "pay_demo_paid_2",
    propertyName: "Pioneer Collective",
    roomNumber: "12A",
    residentName: "Jordan Lee",
    chargeTitle: "Security deposit",
    lineAmount: "$1,695.00",
    amountPaid: "$1,695.00",
    balanceDue: "$0.00",
    dueDate: "Mar 15",
    bucket: "paid",
    statusLabel: "Paid",
    notes: "Held in escrow per lease terms.",
  },
  {
    id: "pay_demo_paid_3",
    propertyName: "Lakeview",
    roomNumber: "Micro-studio",
    residentName: "Sam Rivera",
    chargeTitle: "Move-in fee",
    lineAmount: "$350.00",
    amountPaid: "$350.00",
    balanceDue: "$0.00",
    dueDate: "Feb 10",
    bucket: "paid",
    statusLabel: "Paid",
    notes: "Recorded at lease signing.",
  },
];

export type ManagerWorkOrderBucket = "open" | "scheduled" | "completed";

export type DemoManagerWorkOrderRow = {
  id: string;
  propertyName: string;
  unit: string;
  title: string;
  priority: string;
  status: string;
  bucket: ManagerWorkOrderBucket;
  description: string;
  scheduled: string;
  cost: string;
  /** ISO 8601 visit time once the manager schedules a visit */
  scheduledAtIso?: string;
  /** Prefill when billing resident for work order pass-through */
  residentName?: string;
  residentEmail?: string;
};

export const demoManagerWorkOrderRowsFull: DemoManagerWorkOrderRow[] = [
  {
    id: "WO-9001",
    propertyName: "Demo Building",
    unit: "2A",
    title: "Replace bathroom exhaust fan",
    priority: "Medium",
    status: "Open",
    bucket: "open",
    description: "Motor noisy; replace with quiet model.",
    scheduled: "Not scheduled",
    cost: "—",
    residentName: "Alex Chen",
    residentEmail: "alex.chen@example.com",
  },
  {
    id: "WO-9002",
    propertyName: "Demo Building",
    unit: "3B",
    title: "Hallway light flickering",
    priority: "Low",
    status: "Open",
    bucket: "open",
    description: "LED fixture in 3rd floor hall cycles off after 10 minutes.",
    scheduled: "Not scheduled",
    cost: "—",
    residentName: "Sam Rivera",
    residentEmail: "sam.rivera@example.com",
  },
  {
    id: "WO-9004",
    propertyName: "Pioneer Collective",
    unit: "8B",
    title: "Balcony door weatherstripping",
    priority: "Medium",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Vendor assigned; confirm access with resident before visit.",
    scheduled: "Apr 22, 10am",
    cost: "—",
    scheduledAtIso: "2026-04-22T17:00:00.000Z",
    residentName: "Taylor Brooks",
    residentEmail: "taylor.brooks@example.com",
  },
  {
    id: "WO-9003",
    propertyName: "Pioneer Collective",
    unit: "12A",
    title: "Annual HVAC filter change",
    priority: "Low",
    status: "Completed",
    bucket: "completed",
    description: "Replaced filters in suite and common return.",
    scheduled: "Mar 2, 2pm",
    cost: "$0.00",
    scheduledAtIso: "2026-03-02T14:00:00.000Z",
    residentName: "Jordan Lee",
    residentEmail: "jordan.lee@example.com",
  },
  {
    id: "WO-9005",
    propertyName: "Demo Building",
    unit: "1C",
    title: "Kitchen disposal reset",
    priority: "Low",
    status: "Completed",
    bucket: "completed",
    description: "Jam cleared; tested under load.",
    scheduled: "Apr 8, 3pm",
    cost: "$85.00",
    scheduledAtIso: "2026-04-08T20:00:00.000Z",
    residentName: "Priya Nair",
    residentEmail: "priya.nair@example.com",
  },
];

export type ManagerLeaseBucket = "manager" | "admin" | "resident" | "signed";

export type DemoManagerLeaseDraftRow = {
  id: string;
  resident: string;
  unit: string;
  stageLabel: string;
  updated: string;
  bucket: ManagerLeaseBucket;
  pdfVersion: string;
  notes: string;
};

export const demoManagerLeaseDraftRows: DemoManagerLeaseDraftRow[] = [
  {
    id: "lease_demo_1",
    resident: "Alex Chen",
    unit: "Demo Building · 2A",
    stageLabel: "With resident",
    updated: "Apr 12",
    bucket: "resident",
    pdfVersion: "v3",
    notes: "Standard 12-month term; pet addendum attached.",
  },
  {
    id: "lease_demo_2",
    resident: "Jordan Lee",
    unit: "Pioneer Collective · 12A",
    stageLabel: "Manager review",
    updated: "Apr 14",
    bucket: "manager",
    pdfVersion: "v2",
    notes: "Awaiting final rent concession language.",
  },
  {
    id: "lease_demo_3",
    resident: "Sam Rivera",
    unit: "Lakeview · Micro-studio",
    stageLabel: "Admin review",
    updated: "Apr 15",
    bucket: "admin",
    pdfVersion: "v1",
    notes: "Corporate guarantor attached.",
  },
  {
    id: "lease_demo_4",
    resident: "Priya Nair",
    unit: "Demo Building · 1C",
    stageLabel: "Signed",
    updated: "Mar 28",
    bucket: "signed",
    pdfVersion: "v4",
    notes: "Fully executed; countersigned by owner.",
  },
];

export const demoResidentLeaseHub = {
  moveIn: "—",
  termLabel: "—",
  deposit: "—",
  paymentAtSigning: "—",
  pdfName: "—",
} as const;

export const demoResidentLeaseVersions: { id: string; label: string; note: string }[] = [];

export const demoResidentLeaseChecklist: { id: string; label: string; done: boolean }[] = [];

export type ResidentWorkBucket = "open" | "scheduled" | "completed";

export type DemoResidentWorkOrderRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  bucket: ResidentWorkBucket;
  description: string;
};

export const demoResidentWorkOrderRows: DemoResidentWorkOrderRow[] = [
  {
    id: "WO-9001",
    title: "Replace bathroom exhaust fan",
    category: "HVAC",
    priority: "Medium",
    status: "Open",
    bucket: "open",
    description: "Motor noisy; replace with quiet model. Your manager will schedule a visit and confirm any pass-through cost.",
  },
  {
    id: "RWO-1001",
    title: "Kitchen sink slow drain",
    category: "Plumbing",
    priority: "Medium",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Technician scheduled for Tuesday 10am. Building access via office.",
  },
];

export type DemoResidentChargeRow = {
  id: string;
  title: string;
  amountDue: string;
  balance: string;
  dueDate: string;
  statusLabel: string;
};

export const demoResidentChargeRows: DemoResidentChargeRow[] = [
  {
    id: "chg_demo_1",
    title: "April rent",
    amountDue: "$1,850.00",
    balance: "$185.00",
    dueDate: "May 1",
    statusLabel: "Due soon",
  },
];

export type DemoResidentInboxThread = {
  id: string;
  from: string;
  email: string;
  subject: string;
  preview: string;
  when: string;
  unread: boolean;
  body: string;
};

export const demoResidentInboxThreads: DemoResidentInboxThread[] = [];

/** Seed threads for manager Inbox (local UI state initializes from this list). */
export type DemoManagerInboxThreadSeed = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
};

export const demoManagerInboxThreads: DemoManagerInboxThreadSeed[] = [
  {
    id: "mgr_in_demo_1",
    folder: "inbox",
    from: "Jordan Lee",
    email: "jordan.lee@example.com",
    subject: "Question about move-in date",
    preview: "Hi — can we confirm June 1 lease start for Room 12A? Happy to hop on a quick call.",
    body: "Hi — can we confirm June 1 lease start for Pioneer Collective · 12A? Our current lease ends May 31. Happy to hop on a quick call Tuesday afternoon if easier.\n\nThanks,\nJordan",
    time: "Apr 18 · 9:14am",
    unread: true,
  },
  {
    id: "mgr_in_demo_2",
    folder: "inbox",
    from: "Vendor · Bay HVAC",
    email: "dispatch@bayhvac.example.com",
    subject: "WO-9004 — confirmed Tuesday window",
    preview: "Technician Enrique arrives 10–11am on Apr 22. Building contact call box used for access.",
    body: "Hello,\n\nThis confirms WO-9004 (balcony weatherstripping) at Pioneer Collective · 8B on Apr 22 between 10–11am. Technician Enrique will text the resident 15 minutes prior.\n\n— Bay HVAC Dispatch",
    time: "Apr 17 · 4:02pm",
    unread: true,
  },
  {
    id: "mgr_in_demo_3",
    folder: "inbox",
    from: "Alex Chen",
    email: "alex.chen@example.com",
    subject: "Zelle receipt attached",
    preview: "Paid April rent — screenshot attached. Let me know if anything looks off.",
    body: "Paid April rent via Zelle — confirmation screenshot is attached on my side. Please confirm receipt when you have a moment.\n\nThanks,\nAlex",
    time: "Apr 16 · 11:03am",
    unread: true,
  },
  {
    id: "mgr_in_demo_4",
    folder: "inbox",
    from: "Harbor Holdings LLC",
    email: "harbor.owner@example.com",
    subject: "Portfolio insurance renewal",
    preview: "Annual binder uploaded to shared drive. No coverage gaps flagged.",
    body: "Team — annual liability binder for Demo Building is uploaded to the shared drive under /insurance/2026. No material changes to coverage. Let us know if you need a manager attestation for any listing copy.\n\n— Harbor Holdings",
    time: "Apr 10 · 2:30pm",
    unread: false,
  },
  {
    id: "mgr_in_sent_1",
    folder: "sent",
    from: "You",
    email: "Axis admin team",
    subject: "Clarify pet policy for Pioneer 8B",
    body: "Can you confirm that the coliving house rules allow one ESA cat in 8B? Applicant asked in writing. Thanks.",
    preview: "Can you confirm that the coliving house rules allow one ESA cat in 8B? Applicant asked in writing. Thanks.",
    time: "Apr 9 · 8:50am",
    unread: false,
  },
];

export function demoManagerInboxUnopenedCount(): number {
  return demoManagerInboxThreads.filter((t) => t.folder === "inbox" && t.unread).length;
}
