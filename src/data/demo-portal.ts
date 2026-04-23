/**
 * Portal UI types; table data is empty until backed by your API / database.
 */

import type { RentalWizardFormState } from "@/lib/rental-application/types";

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
  bucket: ManagerApplicationBucket;
  email?: string;
  detail: string;
  application?: RentalWizardFormState;
  /** Listing id from the rental application (for filtering). */
  propertyId?: string;
  /** Manager-selected final property placement. */
  assignedPropertyId?: string;
  /** Manager-selected final room placement. */
  assignedRoomChoice?: string;
  /** Listing owner scope — who should receive this application in the portal. */
  managerUserId?: string | null;
};

export const demoApplicantRows: DemoApplicantRow[] = [];

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

/** Manager Properties calendar filter rows (when no Supabase-backed list yet). */
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
  scheduledAtIso?: string;
  residentName?: string;
  residentEmail?: string;
};

export const demoManagerWorkOrderRowsFull: DemoManagerWorkOrderRow[] = [];

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

export const demoResidentWorkOrderRows: DemoResidentWorkOrderRow[] = [];

export type DemoResidentChargeRow = {
  id: string;
  title: string;
  amountDue: string;
  balance: string;
  dueDate: string;
  statusLabel: string;
};

export const demoResidentChargeRows: DemoResidentChargeRow[] = [];

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

export const demoManagerInboxThreads: DemoManagerInboxThreadSeed[] = [];

export function demoManagerInboxUnopenedCount(): number {
  return demoManagerInboxThreads.filter((t) => t.folder === "inbox" && t.unread).length;
}
