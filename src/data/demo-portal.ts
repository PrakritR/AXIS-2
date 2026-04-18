/**
 * Demo-only portal seed data. Safe to delete when wiring real APIs.
 */

export const DEMO_RESIDENT_DISPLAY_NAME = "Avery Chen";
export const DEMO_RESIDENT_UNIT = "Pioneer Collective · 12A";
export const DEMO_RESIDENT_EMAIL = "avery.chen@resident.demo";
export const DEMO_RESIDENT_PHONE = "(206) 555-0142";
export const DEMO_RESIDENT_EMERGENCY_NAME = "Jamie Chen";
export const DEMO_RESIDENT_EMERGENCY_PHONE = "(425) 555-0199";
export const DEMO_RESIDENT_AXIS_ID = "AXIS-R-2026-4412";
export const DEMO_MANAGER_PROFILE_EMAIL = "jordan.lee@manager.demo";

export const demoPropertyCards = [
  { name: "Pioneer Collective", address: "1201 E Union St, Seattle", units: "42", occupancy: "94%", status: "Active" },
  { name: "Marina Commons", address: "4523 Aurora Ave N", units: "28", occupancy: "89%", status: "Active" },
  { name: "Summit House", address: "908 NW 58th St", units: "16", occupancy: "100%", status: "Full" },
  { name: "Junction Flats", address: "4414 California Ave SW", units: "24", occupancy: "91%", status: "Active" },
  { name: "Ridge Duplex", address: "NE 65th & 20th", units: "2", occupancy: "100%", status: "Active" },
];

/** Owner portal accounts (demo). */
export const demoOwnerAccounts = [
  { name: "Park Row LLC", email: "owners@parkrow.demo", properties: "Pioneer Collective" },
  { name: "Summit Holdings", email: "finance@summitholdings.demo", properties: "Summit House, Ridge Duplex" },
  { name: "Marina Investors", email: "ops@marinainvest.demo", properties: "Marina Commons" },
];

export const demoOwnerPropertyCards = [
  { name: "Pioneer Collective", units: "12 beds linked", access: "View only", manager: "Jordan Lee" },
  { name: "Marina Commons", units: "8 beds linked", access: "View only", manager: "Sam Rivera" },
];

export const demoApplicantRows = [
  { name: "Sam Rivera", property: "Pioneer Collective", stage: "In review", score: "Strong" },
  { name: "Taylor Brooks", property: "Aurora House", stage: "New", score: "—" },
  { name: "Jamie Ortiz", property: "Junction Flats", stage: "Approved", score: "Strong" },
  { name: "Ella Morgan", property: "Pioneer Collective", stage: "Screening", score: "Good" },
  { name: "Jae Kim", property: "Marina Commons", stage: "New", score: "—" },
  { name: "Noah Rivera", property: "Summit House", stage: "Decision ready", score: "Strong" },
  { name: "Amira Shah", property: "Junction Flats", stage: "In review", score: "Good" },
  { name: "Riley Patel", property: "Pioneer Collective", stage: "Rejected", score: "—" },
];

export const demoPaymentRows = [
  { resident: "Avery Chen", unit: "12A", amount: "$950.00", due: "May 1", status: "Upcoming" },
  { resident: "Morgan Diaz", unit: "4B", amount: "$875.00", due: "Apr 1", status: "Paid" },
  { resident: "Riley Patel", unit: "3C", amount: "$995.00", due: "Apr 1", status: "Late" },
  { resident: "Sofia Nguyen", unit: "7", amount: "$1,100.00", due: "May 1", status: "Upcoming" },
  { resident: "Lila Chen", unit: "3", amount: "$920.00", due: "Apr 15", status: "Paid" },
  { resident: "Devon Walsh", unit: "West", amount: "$1,050.00", due: "May 1", status: "Pending" },
];

export const demoWorkOrderRows = [
  { id: "WO-8831", unit: "12A", title: "Leak under kitchen sink", priority: "High", status: "In progress" },
  { id: "WO-8802", unit: "4B", title: "Heat not reaching bedroom", priority: "Medium", status: "Open" },
  { id: "WO-8740", unit: "West", title: "Mailbox key replacement", priority: "Low", status: "Completed" },
  { id: "WO-9012", unit: "7", title: "Dishwasher not draining", priority: "Medium", status: "Scheduled" },
  { id: "WO-9018", unit: "2A", title: "Smoke detector chirp", priority: "Low", status: "Open" },
];

export const demoInboxPreviewRows = [
  { from: "Jordan Lee", subject: "Tour request for Aurora House", preview: "Saturday afternoon?", when: "2h ago", unread: "true" },
  { from: "Axis Leasing", subject: "Application received", preview: "Pioneer Collective application.", when: "Yesterday", unread: "false" },
  { from: "Maintenance", subject: "Work order #WO-8831 updated", preview: "Technician Tuesday AM.", when: "Mon", unread: "true" },
  { from: "Sofia Nguyen", subject: "Lease packet question", preview: "Utilities section before signing.", when: "9:14 AM", unread: "true" },
  { from: "Northside Plumbing", subject: "Appointment confirmed", preview: "Marina Commons room 7.", when: "Yesterday", unread: "false" },
];

export const demoAdminPropertyRows = [
  { name: "Pioneer Collective", manager: "Jordan Lee · Axis PM", units: "42", status: "Active" },
  { name: "Marina Commons", manager: "Sam Rivera · Axis PM", units: "28", status: "Active" },
  { name: "Aurora House", manager: "Cascade Rentals", units: "6", status: "Pending approval" },
  { name: "Ridge Duplex", manager: "Axis Demo Manager", units: "2", status: "Active" },
  { name: "Summit House", manager: "Jordan Lee · Axis PM", units: "16", status: "Active" },
];

export const demoManagerSubscriberRows = [
  { name: "Jordan Lee", org: "Axis Property Management", portfolio: "5 properties", status: "Subscribed", since: "Jan 2024" },
  { name: "Sam Rivera", org: "Axis Property Management", portfolio: "3 properties", status: "Subscribed", since: "Mar 2024" },
  { name: "Alex Morgan", org: "Northwind PM", portfolio: "12 properties", status: "Subscribed", since: "Jun 2023" },
  { name: "Casey Ng", org: "Cascade Rentals", portfolio: "8 properties", status: "Trial", since: "Apr 2026" },
  { name: "Riley Frost", org: "Harbor Homes", portfolio: "2 properties", status: "Past", since: "Nov 2022" },
];

export const demoLeasePipelineRows = [
  { resident: "Sofia Nguyen", unit: "Marina Commons · 7", stage: "With resident", updated: "Today" },
  { resident: "Noah Rivera", unit: "Pioneer · 2A", stage: "Manager review", updated: "Yesterday" },
  { resident: "Lila Chen", unit: "Summit · 3", stage: "Signed", updated: "Apr 2" },
  { resident: "Jamie Ortiz", unit: "Junction · 5B", stage: "Admin review", updated: "Apr 8" },
];

export const demoResidentPropertyRows = [
  { building: "Pioneer Collective", unit: "12A", manager: "Jordan Lee", since: "Apr 2026" },
];

export const demoResidentLeaseRows = [
  { document: "Lease 2026–2027", status: "Signed", updated: "Apr 1" },
  { document: "Parking addendum", status: "With resident", updated: "Apr 12" },
];

/** KPI-style counts derived from demo tables (strings for UI). */
export const demoKpis = {
  applications: { pending: "5", approved: "2", rejected: "1" },
  leases: { managerReview: "1", adminReview: "1", withResident: "1", signed: "1" },
  payments: { pending: "2", overdue: "1", paid: "3" },
  workOrders: { open: "2", scheduled: "1", completed: "1" },
  managers: { current: "4", past: "1" },
  calendar: { today: "2", week: "5", month: "14", total: "38" },
  residentCalendar: { today: "1", week: "3", month: "6", total: "12" },
} as const;

/** Manager Properties panel — HouseManagement-style buckets (demo). */
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
    id: "mh1",
    name: "Pioneer Collective",
    address: "1201 E Union St, Seattle, WA 98122",
    propertyType: "Co-living",
    roomCount: 42,
    bathCount: 8,
    appFee: "$50",
    bucket: "listed",
    detail: "Live on Axis listings · bi-monthly turnover sync enabled.",
  },
  {
    id: "mh2",
    name: "Marina Commons",
    address: "4523 Aurora Ave N, Seattle, WA 98103",
    propertyType: "Co-living",
    roomCount: 28,
    bathCount: 6,
    appFee: "$50",
    bucket: "listed",
    detail: "Waterfront-adjacent marketing photos approved.",
  },
  {
    id: "mh3",
    name: "Summit House",
    address: "908 NW 58th St, Seattle, WA 98107",
    propertyType: "Shared house",
    roomCount: 16,
    bathCount: 4,
    appFee: "$40",
    bucket: "pending",
    detail: "Awaiting final Axis admin checklist for fire egress notes.",
  },
  {
    id: "mh4",
    name: "Aurora House",
    address: "4523 Aurora Ave N, Seattle, WA 98103",
    propertyType: "Co-living",
    roomCount: 6,
    bathCount: 2,
    appFee: "$50",
    bucket: "pending",
    detail: "New manager submission — pricing block needs confirmation.",
  },
  {
    id: "mh5",
    name: "Junction Flats",
    address: "4414 California Ave SW, Seattle, WA 98116",
    propertyType: "Micro-units",
    roomCount: 24,
    bathCount: 5,
    appFee: "$50",
    bucket: "change",
    detail: "Axis requested updated amenity list and parking map.",
  },
  {
    id: "mh6",
    name: "Ridge Duplex",
    address: "NE 65th & 20th, Seattle, WA 98115",
    propertyType: "Duplex",
    roomCount: 2,
    bathCount: 2,
    appFee: "$75",
    bucket: "unlisted",
    detail: "Temporarily hidden while owner negotiates insurance rider.",
  },
  {
    id: "mh7",
    name: "Lakeview Micro-studio",
    address: "2200 Fairview Ave E, Seattle, WA 98102",
    propertyType: "Studio cluster",
    roomCount: 18,
    bathCount: 3,
    appFee: "$50",
    bucket: "rejected",
    detail: "Rejected: incomplete egress documentation (demo).",
  },
];

/** Manager Payments ledger — 10-column layout (demo). */
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
};

export const demoManagerPaymentLedgerRows: DemoManagerPaymentLedgerRow[] = [
  {
    id: "mp1",
    propertyName: "Pioneer Collective",
    roomNumber: "12A",
    residentName: "Avery Chen",
    chargeTitle: "April rent",
    lineAmount: "$950.00",
    amountPaid: "$0.00",
    balanceDue: "$950.00",
    dueDate: "May 1",
    bucket: "pending",
    statusLabel: "Unpaid",
    notes: "Resident opted out of autopay for this cycle.",
  },
  {
    id: "mp2",
    propertyName: "Marina Commons",
    roomNumber: "7",
    residentName: "Sofia Nguyen",
    chargeTitle: "Utilities bundle",
    lineAmount: "$95.00",
    amountPaid: "$0.00",
    balanceDue: "$95.00",
    dueDate: "Apr 28",
    bucket: "pending",
    statusLabel: "Due soon",
    notes: "Flat community utilities estimate.",
  },
  {
    id: "mp3",
    propertyName: "Pioneer Collective",
    roomNumber: "4B",
    residentName: "Morgan Diaz",
    chargeTitle: "March rent",
    lineAmount: "$875.00",
    amountPaid: "$400.00",
    balanceDue: "$475.00",
    dueDate: "Apr 1",
    bucket: "overdue",
    statusLabel: "Partial · overdue",
    notes: "Partial Zelle received Mar 29.",
  },
  {
    id: "mp4",
    propertyName: "Junction Flats",
    roomNumber: "3C",
    residentName: "Riley Patel",
    chargeTitle: "April rent",
    lineAmount: "$995.00",
    amountPaid: "$0.00",
    balanceDue: "$995.00",
    dueDate: "Apr 1",
    bucket: "overdue",
    statusLabel: "Overdue",
    notes: "Reminder SMS queued (demo).",
  },
  {
    id: "mp5",
    propertyName: "Summit House",
    roomNumber: "3",
    residentName: "Lila Chen",
    chargeTitle: "April rent",
    lineAmount: "$920.00",
    amountPaid: "$920.00",
    balanceDue: "$0.00",
    dueDate: "Apr 15",
    bucket: "paid",
    statusLabel: "Paid",
    notes: "Stripe card · receipt emailed.",
  },
  {
    id: "mp6",
    propertyName: "Ridge Duplex",
    roomNumber: "West",
    residentName: "Devon Walsh",
    chargeTitle: "May rent",
    lineAmount: "$1,050.00",
    amountPaid: "$1,050.00",
    balanceDue: "$0.00",
    dueDate: "May 1",
    bucket: "paid",
    statusLabel: "Paid",
    notes: "Marked paid via Zelle + internal note.",
  },
];

/** Manager work orders — bucket + expansion fields (demo). */
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
};

export const demoManagerWorkOrderRowsFull: DemoManagerWorkOrderRow[] = [
  {
    id: "WO-8831",
    propertyName: "Pioneer Collective",
    unit: "12A",
    title: "Leak under kitchen sink",
    priority: "High",
    status: "In progress",
    bucket: "open",
    description: "Tenant reports slow drip under P-trap. Photos attached in thread.",
    scheduled: "Apr 22 AM",
    cost: "—",
  },
  {
    id: "WO-8802",
    propertyName: "Marina Commons",
    unit: "4B",
    title: "Heat not reaching bedroom",
    priority: "Medium",
    status: "Open",
    bucket: "open",
    description: "Baseboard loop may need bleed; check thermostat schedule.",
    scheduled: "Unscheduled",
    cost: "—",
  },
  {
    id: "WO-9012",
    propertyName: "Junction Flats",
    unit: "7",
    title: "Dishwasher not draining",
    priority: "Medium",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Vendor confirmed Tuesday window; resident notified.",
    scheduled: "Apr 23 1–4pm",
    cost: "$120 est.",
  },
  {
    id: "WO-8740",
    propertyName: "Ridge Duplex",
    unit: "West",
    title: "Mailbox key replacement",
    priority: "Low",
    status: "Completed",
    bucket: "completed",
    description: "New keys logged in Axis inventory.",
    scheduled: "Apr 10",
    cost: "$35",
  },
  {
    id: "WO-9018",
    propertyName: "Pioneer Collective",
    unit: "2A",
    title: "Smoke detector chirp",
    priority: "Low",
    status: "Open",
    bucket: "open",
    description: "Battery swap + test sequence per Seattle rental checklist.",
    scheduled: "Apr 26",
    cost: "—",
  },
];

/** Manager lease drafts — pipeline stages (demo). */
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
    id: "ld1",
    resident: "Noah Rivera",
    unit: "Pioneer · 2A",
    stageLabel: "Manager review",
    updated: "Yesterday",
    bucket: "manager",
    notes: "Parking addendum language pending legal template.",
    pdfVersion: "v3",
  },
  {
    id: "ld2",
    resident: "Jamie Ortiz",
    unit: "Junction · 5B",
    stageLabel: "Admin review",
    updated: "Apr 8",
    bucket: "admin",
    notes: "Awaiting Axis compliance stamp on utilities page.",
    pdfVersion: "v2",
  },
  {
    id: "ld3",
    resident: "Sofia Nguyen",
    unit: "Marina Commons · 7",
    stageLabel: "With resident",
    updated: "Today",
    bucket: "resident",
    notes: "Resident opened packet; signature requested by May 1.",
    pdfVersion: "v4",
  },
  {
    id: "ld4",
    resident: "Lila Chen",
    unit: "Summit · 3",
    stageLabel: "Signed",
    updated: "Apr 2",
    bucket: "signed",
    notes: "Fully executed PDF archived.",
    pdfVersion: "final",
  },
];

/** Resident — Lease tab: move-in, term, deposit, PDF + checklist (demo). */
export const demoResidentLeaseHub = {
  moveIn: "Apr 15, 2026",
  termLabel: "Apr 15, 2026 – Apr 14, 2027",
  deposit: "$1,900.00 (held in trust)",
  paymentAtSigning: "$950.00 first month (prorated from move-in)",
  pdfName: "Lease · Pioneer Collective · 12A.pdf",
} as const;

export const demoResidentLeaseVersions = [
  { id: "lv5", label: "v5 · current · Apr 10", note: "Utilities page clarified." },
  { id: "lv4", label: "v4 · Apr 5", note: "Parking stall assignment." },
  { id: "lv3", label: "v3 · Mar 28", note: "Initial draft." },
] as const;

export const demoResidentLeaseChecklist = [
  { id: "ck1", label: "Government ID uploaded", done: true },
  { id: "ck2", label: "Renter insurance on file", done: true },
  { id: "ck3", label: "Axis ID verified", done: true },
  { id: "ck4", label: "Utilities acknowledgment", done: false },
  { id: "ck5", label: "Parking addendum", done: false },
] as const;

/** Resident — Work orders tab buckets (demo). */
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
    id: "WO-8831",
    title: "Leak under kitchen sink",
    category: "Plumbing",
    priority: "High",
    status: "In progress",
    bucket: "open",
    description:
      "Slow drip under the P-trap. Photos are on file; avoid running the disposal until the technician clears the repair.",
  },
  {
    id: "RW-210",
    title: "Bedroom blind repair",
    category: "General",
    priority: "Low",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Vendor window Apr 24, 10am–2pm. Building staff may knock for access.",
  },
  {
    id: "RW-198",
    title: "Mailbox labels",
    category: "Access",
    priority: "Low",
    status: "Completed",
    bucket: "completed",
    description: "Mail hub labels installed and keys tested.",
  },
];

/** Resident — Payments tab line items (demo). */
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
    id: "rc1",
    title: "April rent",
    amountDue: "$950.00",
    balance: "$950.00",
    dueDate: "May 1, 2026",
    statusLabel: "Due",
  },
  {
    id: "rc2",
    title: "Parking stall B2",
    amountDue: "$75.00",
    balance: "$0.00",
    dueDate: "Apr 1, 2026",
    statusLabel: "Paid",
  },
  {
    id: "rc3",
    title: "Move-in cleaning fee",
    amountDue: "$120.00",
    balance: "$60.00",
    dueDate: "Apr 20, 2026",
    statusLabel: "Partial",
  },
];

/** Resident — Inbox threads (demo). */
export type DemoResidentInboxThread = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  when: string;
  unread: boolean;
  body: string;
};

export const demoResidentInboxThreads: DemoResidentInboxThread[] = [
  {
    id: "t1",
    from: "Jordan Lee",
    subject: "Lease packet ready for signature",
    preview: "Open the latest v5 draft when you have a quiet moment…",
    when: "2h ago",
    unread: true,
    body: "Hi Avery — v5 is live in your portal. Two acknowledgments remain in the checklist before you can sign.",
  },
  {
    id: "t2",
    from: "Axis Leasing",
    subject: "Application received",
    preview: "Pioneer Collective application is on file.",
    when: "Yesterday",
    unread: false,
    body: "Thanks for applying. This thread is archived now that you are approved.",
  },
  {
    id: "t3",
    from: "Maintenance",
    subject: "Work order #WO-8831 updated",
    preview: "Technician Tuesday AM.",
    when: "Mon",
    unread: true,
    body: "We booked Northside Plumbing for Tuesday morning. Reply here if that window no longer works.",
  },
  {
    id: "t4",
    from: "Sofia Nguyen",
    subject: "Shared kitchen etiquette",
    preview: "Quick note on labeling shelves…",
    when: "Apr 12",
    unread: false,
    body: "Hey neighbor — happy to align on a simple shelf labeling system for dry goods.",
  },
];
