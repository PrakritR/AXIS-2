/**
 * Portal UI types and empty tables. Listing inventory stays in `mock-properties` + demo pipeline.
 * Wire Supabase queries into portal panels to replace these empty arrays.
 */

import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { snapshotJordanLee, snapshotSamRivera } from "@/data/manager-application-snapshots";

export const demoKpis = {
  applications: { pending: "0", approved: "0", rejected: "0" },
  leases: { managerReview: "0", adminReview: "0", withResident: "0", signed: "0" },
  payments: { pending: "0", overdue: "0", paid: "0" },
  workOrders: { open: "0", scheduled: "0", completed: "0" },
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

export const demoManagerHouseRows: DemoManagerHouseRow[] = [
  {
    id: "house_demo_1",
    name: "Demo Building",
    address: "100 Market St, San Francisco, CA",
    propertyType: "Multi-family",
    roomCount: 24,
    bathCount: 24,
    appFee: "$45",
    bucket: "listed",
    detail: "Demo portfolio property used for applications, leases, and work orders.",
  },
  {
    id: "house_demo_2",
    name: "Pioneer Collective",
    address: "2200 Mission St, San Francisco, CA",
    propertyType: "Co-living",
    roomCount: 18,
    bathCount: 18,
    appFee: "$40",
    bucket: "listed",
    detail: "Listed; applications route to this manager workspace.",
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

export const demoManagerPaymentLedgerRows: DemoManagerPaymentLedgerRow[] = [];

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
