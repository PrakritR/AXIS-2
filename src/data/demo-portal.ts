/**
 * Portal UI types and empty tables. Listing inventory stays in `mock-properties` + demo pipeline.
 * Wire Supabase queries into portal panels to replace these empty arrays.
 */

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

export const demoOwnerAccounts: DemoOwnerAccountRow[] = [];

export const demoOwnerPropertyCards: { name: string; units: string; access: string; manager: string }[] = [];

export type ManagerApplicationBucket = "pending" | "approved" | "rejected";

export type DemoApplicantRow = {
  id: string;
  name: string;
  property: string;
  stage: string;
  score: string;
  bucket: ManagerApplicationBucket;
  email?: string;
  /** Full copy for expandable Details row */
  detail: string;
};

export const demoApplicantRows: DemoApplicantRow[] = [
  {
    id: "app_demo_1",
    name: "Jordan Lee",
    property: "Harbor View Lofts · Unit 4B",
    stage: "Screening",
    score: "82",
    bucket: "pending",
    email: "jordan.lee@example.com",
    detail:
      "Income verified at 3.2× rent. Pet deposit noted. References requested from prior landlord; credit check in progress.",
  },
  {
    id: "app_demo_2",
    name: "Sam Rivera",
    property: "Maple Commons · Studio 12",
    stage: "Documents",
    score: "76",
    bucket: "pending",
    email: "sam.rivera@example.com",
    detail: "ID and pay stubs uploaded. Awaiting employer verification link.",
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

export const demoLeasePipelineRows: { resident: string; unit: string; stage: string; updated: string }[] = [];

export const demoResidentPropertyRows: { building: string; unit: string; manager: string; since: string }[] = [];

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

export const demoManagerHouseRows: DemoManagerHouseRow[] = [];

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
    status: "Scheduled",
    bucket: "scheduled",
    description: "Motor noisy; replace with quiet model.",
    scheduled: "Apr 22, 10am",
    cost: "—",
    residentName: "Alex Chen",
    residentEmail: "alex.chen@example.com",
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

export const demoManagerLeaseDraftRows: DemoManagerLeaseDraftRow[] = [];

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
