/**
 * Segmented guided demos for `/demo` — each segment is a self-contained autoplay story.
 */

export type DemoSegment =
  | "overall"
  | "applications"
  | "leasing"
  | "communication"
  | "promotion"
  | "payments"
  | "work_orders";

export type SegmentStepDef = {
  step: number;
  title: string;
  hint: string;
  role: "manager" | "resident" | "vendor";
  section: string;
  tab?: string | null;
};

export const DEMO_SEGMENT_LABELS: Record<DemoSegment, string> = {
  overall: "Full tour",
  applications: "Applications",
  leasing: "Leasing",
  communication: "Communication",
  promotion: "Promotion",
  payments: "Payments",
  work_orders: "Work orders",
};

export const GUIDED_STEPS_OVERALL: SegmentStepDef[] = [
  { step: 1, title: "Create a property", hint: "Listing wizard fills in and submits.", role: "manager", section: "properties" },
  { step: 2, title: "Submit an application", hint: "Resident starts a new application and submits.", role: "resident", section: "applications" },
  { step: 3, title: "Screen the applicant", hint: "Manager expands screening and runs a background check.", role: "manager", section: "applications" },
  { step: 4, title: "Approve application", hint: "Application is approved and lease draft is created.", role: "manager", section: "applications" },
  { step: 5, title: "Generate AI lease", hint: "Lease document is drafted from application answers.", role: "manager", section: "leases", tab: "manager" },
  { step: 6, title: "Send lease to resident", hint: "Lease is released for resident signature.", role: "manager", section: "leases", tab: "resident" },
  { step: 7, title: "Resident signs lease", hint: "Resident reviews and electronically signs.", role: "resident", section: "lease" },
  { step: 8, title: "Manager countersigns", hint: "Manager signs to fully execute the lease.", role: "manager", section: "leases", tab: "signed" },
];

export const GUIDED_STEPS_APPLICATIONS: SegmentStepDef[] = [
  { step: 1, title: "Submit an application", hint: "Resident starts and submits a rental application.", role: "resident", section: "applications" },
  { step: 2, title: "Screen the applicant", hint: "Manager runs a background check.", role: "manager", section: "applications" },
  { step: 3, title: "Approve application", hint: "Manager approves the pending application.", role: "manager", section: "applications" },
];

export const GUIDED_STEPS_INBOX: SegmentStepDef[] = [
  { step: 1, title: "Read resident message", hint: "Manager opens an unopened inbox thread.", role: "manager", section: "communication", tab: "unopened" },
  { step: 2, title: "Send a message", hint: "Manager composes and sends a new message.", role: "manager", section: "communication" },
  { step: 3, title: "Resident replies", hint: "Resident reads and replies in Communication.", role: "resident", section: "communication" },
];

export const GUIDED_STEPS_PROMOTION: SegmentStepDef[] = [
  { step: 1, title: "Open promotion", hint: "Manager opens the Promotion workspace.", role: "manager", section: "promotion" },
  { step: 2, title: "Create a flyer", hint: "Start a new listing flyer promotion.", role: "manager", section: "promotion" },
  { step: 3, title: "Generate flyer", hint: "AI drafts copy and builds the flyer.", role: "manager", section: "promotion" },
  { step: 4, title: "Review & download", hint: "Expand the flyer and download the PDF.", role: "manager", section: "promotion" },
];

export const GUIDED_STEPS_LEASING: SegmentStepDef[] = [
  { step: 1, title: "Submit an application", hint: "Resident applies for the listed property.", role: "resident", section: "applications" },
  { step: 2, title: "Screen the applicant", hint: "Manager runs a background check.", role: "manager", section: "applications" },
  { step: 3, title: "Approve application", hint: "Application moves to approved.", role: "manager", section: "applications" },
  { step: 4, title: "Generate AI lease", hint: "Lease document is drafted.", role: "manager", section: "leases", tab: "manager" },
  { step: 5, title: "Send lease to resident", hint: "Lease sent for resident signature.", role: "manager", section: "leases", tab: "resident" },
  { step: 6, title: "Resident signs lease", hint: "Resident signs electronically.", role: "resident", section: "lease" },
  { step: 7, title: "Manager countersigns", hint: "Manager executes the lease.", role: "manager", section: "leases", tab: "signed" },
];

export const GUIDED_STEPS_PAYMENTS: SegmentStepDef[] = [
  { step: 1, title: "Review rent ledger", hint: "Manager reviews pending rent charges.", role: "manager", section: "payments" },
  { step: 2, title: "Send rent reminder", hint: "Manager sends a payment reminder.", role: "manager", section: "payments" },
  { step: 3, title: "Resident pays rent", hint: "Resident pays from the payments tab.", role: "resident", section: "payments" },
  { step: 4, title: "Confirm payment", hint: "Manager marks the charge paid.", role: "manager", section: "payments" },
];

export const GUIDED_STEPS_WORK_ORDERS: SegmentStepDef[] = [
  { step: 1, title: "Resident maintenance request", hint: "Resident submits a maintenance request.", role: "resident", section: "services", tab: "requests" },
  { step: 2, title: "Manager work order", hint: "Manager reviews the open work order.", role: "manager", section: "services", tab: "work-orders" },
  { step: 3, title: "Vendor submits bid", hint: "Vendor quotes labor and materials.", role: "vendor", section: "work-orders" },
  { step: 4, title: "Accept vendor bid", hint: "Manager accepts the winning bid.", role: "manager", section: "services", tab: "work-orders" },
  { step: 5, title: "Schedule visit", hint: "Manager schedules the repair visit.", role: "manager", section: "services", tab: "work-orders" },
  { step: 6, title: "Vendor marks done", hint: "Vendor completes the work.", role: "vendor", section: "work-orders" },
  { step: 7, title: "Approve & pay", hint: "Manager approves and pays the vendor.", role: "manager", section: "services", tab: "work-orders" },
];

export const GUIDED_STEPS_BY_SEGMENT: Record<DemoSegment, SegmentStepDef[]> = {
  overall: GUIDED_STEPS_OVERALL,
  applications: GUIDED_STEPS_APPLICATIONS,
  leasing: GUIDED_STEPS_LEASING,
  communication: GUIDED_STEPS_INBOX,
  promotion: GUIDED_STEPS_PROMOTION,
  payments: GUIDED_STEPS_PAYMENTS,
  work_orders: GUIDED_STEPS_WORK_ORDERS,
};

export function segmentStepCount(segment: DemoSegment): number {
  return GUIDED_STEPS_BY_SEGMENT[segment].length;
}

export function getSegmentStepDef(segment: DemoSegment, step: number): SegmentStepDef | null {
  return GUIDED_STEPS_BY_SEGMENT[segment].find((s) => s.step === step) ?? null;
}
