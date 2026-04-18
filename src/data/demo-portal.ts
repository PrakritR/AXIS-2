/**
 * Demo-only portal seed data. Safe to delete when wiring real APIs.
 */

export const DEMO_RESIDENT_DISPLAY_NAME = "Avery Chen";
export const DEMO_RESIDENT_UNIT = "Pioneer Collective · 12A";
export const DEMO_RESIDENT_EMAIL = "avery.chen@resident.demo";
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
