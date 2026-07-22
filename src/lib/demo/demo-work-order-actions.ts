import {
  CANONICAL_DEMO_GUIDED_EMAIL,
  CANONICAL_DEMO_GUIDED_NAME,
  CANONICAL_DEMO_VENDOR_EMAIL,
  CANONICAL_DEMO_VENDOR_NAME,
} from "@/lib/demo/demo-canonical-accounts";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import {
  DEMO_GUIDED_USER_ID,
  DEMO_VENDOR_USER_ID,
  resolveDemoManagerScopeUserId,
} from "@/lib/demo/demo-session";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  updateManagerWorkOrder,
  writeManagerWorkOrderRows,
} from "@/lib/manager-work-orders-storage";
import { readManagerVendorRows, writeManagerVendorRows, type ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { readWorkOrderBids, upsertWorkOrderBid, WORK_ORDER_BIDS_EVENT } from "@/lib/work-order-bids-storage";
import { createServiceRequest, CUSTOM_SERVICE_REQUEST_OFFER_ID } from "@/lib/service-requests-storage";

export const DEMO_GUIDED_WORK_ORDER_ID = "demo-guided-wo";

function emitWorkOrders() {
  window.dispatchEvent(new Event(MANAGER_WORK_ORDERS_EVENT));
}

function emitBids() {
  window.dispatchEvent(new Event(WORK_ORDER_BIDS_EVENT));
}

export function ensureDemoVendorDirectory(): ManagerVendorRow {
  const managerUserId = resolveDemoManagerScopeUserId();
  const existing = readManagerVendorRows().find(
    (v) => v.name === CANONICAL_DEMO_VENDOR_NAME || v.email?.toLowerCase() === CANONICAL_DEMO_VENDOR_EMAIL,
  );
  if (existing) return existing;

  const vendor: ManagerVendorRow = {
    id: "demo-vendor-1",
    name: CANONICAL_DEMO_VENDOR_NAME,
    email: CANONICAL_DEMO_VENDOR_EMAIL,
    phone: "(206) 555-0188",
    trade: "HVAC",
    notes: "",
    active: true,
    managerUserId,
    vendorUserId: DEMO_VENDOR_USER_ID,
  };
  writeManagerVendorRows([vendor, ...readManagerVendorRows()]);
  return vendor;
}

export function createDemoResidentServiceRequest(propertyId: string): string {
  const app = readManagerApplicationRows().find(
    (r) => r.bucket === "approved" && (r.email ?? "").toLowerCase() === CANONICAL_DEMO_GUIDED_EMAIL,
  );
  const id = `demo-guided-req-${Date.now()}`;
  void createServiceRequest({
    offerId: CUSTOM_SERVICE_REQUEST_OFFER_ID,
    offerName: "Kitchen sink slow drain",
    offerDescription: "Water backs up in the kitchen sink after a few seconds. Started this week.",
    price: "",
    deposit: "",
    propertyId: propertyId || app?.propertyId || "",
    returnByDate: "",
    notes: "Kitchen sink slow drain — water backs up after a few seconds.",
    residentName: CANONICAL_DEMO_GUIDED_NAME,
    residentEmail: CANONICAL_DEMO_GUIDED_EMAIL,
    managerUserId: resolveDemoManagerScopeUserId(),
  });
  return id;
}

export function createDemoMaintenanceWorkOrder(propertyId: string): string {
  const managerUserId = resolveDemoManagerScopeUserId();
  const app = readManagerApplicationRows().find(
    (r) => r.bucket === "approved" && (r.email ?? "").toLowerCase() === CANONICAL_DEMO_GUIDED_EMAIL,
  );
  const vendor = ensureDemoVendorDirectory();
  const pid = propertyId.trim() || app?.propertyId?.trim() || "";
  const iso = new Date().toISOString();

  const row: DemoManagerWorkOrderRow = {
    id: DEMO_GUIDED_WORK_ORDER_ID,
    propertyName: app?.property?.trim() || "Demo Property",
    propertyId: pid,
    assignedPropertyId: pid,
    unit: "Room A",
    title: "Repair kitchen sink drain",
    priority: "Normal",
    status: "Submitted",
    bucket: "open",
    category: "plumbing",
    description:
      "Slow kitchen drain reported by resident. Vendor to snake line and check P-trap for blockage.",
    scheduled: "—",
    cost: "—",
    preferredArrival: "Weekday evenings after 5pm",
    residentName: CANONICAL_DEMO_GUIDED_NAME,
    residentEmail: CANONICAL_DEMO_GUIDED_EMAIL,
    managerUserId,
    managerInitiated: false,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorAssignedAt: iso,
    biddingOpen: true,
    biddingOpenedAt: iso,
  };

  const rest = readManagerWorkOrderRows().filter((r) => r.id !== DEMO_GUIDED_WORK_ORDER_ID);
  writeManagerWorkOrderRows([row, ...rest]);
  emitWorkOrders();
  return DEMO_GUIDED_WORK_ORDER_ID;
}

export function submitDemoVendorBid(workOrderId = DEMO_GUIDED_WORK_ORDER_ID): string {
  const vendor = ensureDemoVendorDirectory();
  const proposed = new Date();
  proposed.setDate(proposed.getDate() + 3);
  proposed.setHours(14, 0, 0, 0);

  const bid = upsertWorkOrderBid({
    workOrderId,
    vendorUserId: DEMO_VENDOR_USER_ID,
    vendorDirectoryId: vendor.id,
    vendorName: vendor.name,
    vendorEmail: vendor.email,
    quoteMode: "upfront",
    amountCents: 18_500,
    materialsCents: 2_500,
    proposedTime: proposed.toISOString(),
    note: "Can complete snake + P-trap clean same visit.",
    status: "submitted",
  });
  emitBids();
  return bid.id;
}

export function acceptDemoWorkOrderBid(workOrderId = DEMO_GUIDED_WORK_ORDER_ID): boolean {
  const bid = readWorkOrderBids(workOrderId).find((b) => b.status === "submitted" && b.amountCents != null);
  if (!bid) return false;
  const now = new Date().toISOString();
  const totalCents = (bid.amountCents ?? 0) + bid.materialsCents;

  upsertWorkOrderBid({ ...bid, status: "accepted" });
  for (const other of readWorkOrderBids(workOrderId)) {
    if (other.id !== bid.id && other.status === "submitted") {
      upsertWorkOrderBid({ ...other, status: "declined" });
    }
  }

  updateManagerWorkOrder(workOrderId, (r) => ({
    ...r,
    vendorId: bid.vendorDirectoryId ?? r.vendorId,
    vendorName: bid.vendorName || r.vendorName,
    vendorAssignedAt: now,
    selfAssigned: false,
    cost: `$${(totalCents / 100).toFixed(2)}`,
    vendorCostCents: bid.amountCents ?? undefined,
    materialsCostCents: bid.materialsCents,
    biddingOpen: false,
    biddingResolvedAt: now,
  }));
  emitBids();
  emitWorkOrders();
  return true;
}

export function scheduleDemoWorkOrder(workOrderId = DEMO_GUIDED_WORK_ORDER_ID): boolean {
  const visit = new Date();
  visit.setDate(visit.getDate() + 2);
  visit.setHours(14, 0, 0, 0);
  const iso = visit.toISOString();
  const label = visit.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  updateManagerWorkOrder(workOrderId, (r) => ({
    ...r,
    bucket: "scheduled",
    status: "Scheduled",
    scheduled: label,
    scheduledAtIso: iso,
  }));
  emitWorkOrders();
  return true;
}

export function markDemoWorkOrderVendorDone(workOrderId = DEMO_GUIDED_WORK_ORDER_ID): boolean {
  const now = new Date().toISOString();
  updateManagerWorkOrder(workOrderId, (r) => ({
    ...r,
    automationStatus: "vendor_marked_done",
    vendorMarkedDoneAt: now,
    vendorMarkedDoneNote: "Drain cleared — tested flow for 5 minutes.",
    vendorCostCents: r.vendorCostCents ?? 18_500,
    materialsCostCents: r.materialsCostCents ?? 2_500,
  }));
  emitWorkOrders();
  return true;
}

export function approveDemoWorkOrderPay(workOrderId = DEMO_GUIDED_WORK_ORDER_ID): boolean {
  const now = new Date().toISOString();
  updateManagerWorkOrder(workOrderId, (r) => ({
    ...r,
    bucket: "completed",
    status: "Completed",
    automationStatus: "paid",
    paidAt: now,
    completedAt: now,
  }));
  emitWorkOrders();
  return true;
}
