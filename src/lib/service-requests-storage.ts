import {
  createManagerCharge,
  deleteHouseholdCharge,
  markHouseholdChargePaid,
  parseMoneyAmount,
} from "@/lib/household-charges";
import { getPropertyById } from "@/lib/rental-application/data";

export const SERVICE_REQUESTS_EVENT = "axis:service-requests";
const KEY = "axis_service_requests_v1";

// TTL + in-flight guard so remounts/overlapping callers collapse into one
// network fetch, matching the other portal sync helpers.
const SERVICE_REQUESTS_SYNC_TTL_MS = 15_000;
let serviceRequestsLastSyncedAt = 0;
let serviceRequestsSyncPromise: Promise<ServiceRequest[]> | null = null;

export type ServiceRequestStatus = "pending" | "approved" | "denied" | "returned";

export type ServiceRequest = {
  id: string;
  // Offer snapshot at time of request
  offerId: string;
  offerName: string;
  offerDescription: string;
  price: string;
  deposit: string;
  // Participants
  residentEmail: string;
  residentName: string;
  managerUserId: string;
  propertyId: string;
  // Request details
  returnByDate: string;  // ISO date, empty if no deposit
  notes: string;
  requestedAt: string;
  status: ServiceRequestStatus;
  // Manager actions
  approvedAt?: string;
  deniedAt?: string;
  managerNote?: string;
  // Charge tracking (relevant when approved)
  servicePaid: boolean;
  depositPaid: boolean;
  servicePaidAt?: string;
  depositPaidAt?: string;
  serviceChargeId?: string;
  depositChargeId?: string;
  // Return
  returnPhotoDataUrl?: string;
  returnedAt?: string;
};

function toPositiveDollarAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parseMoneyAmount(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolvePropertyLabel(propertyId: string): string {
  const resolved = getPropertyById(propertyId.trim());
  if (!resolved) return "Property";
  const street = resolved.address.split(",")[0]?.trim();
  return street || resolved.buildingName || resolved.title || "Property";
}

function readAll(): ServiceRequest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ServiceRequest[];
  } catch {
    return [];
  }
}

function writeAll(requests: ServiceRequest[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(requests));
  window.dispatchEvent(new Event(SERVICE_REQUESTS_EVENT));
}

/**
 * Server mirroring. Service requests persist to `portal_service_request_records`
 * via the service-role API route so they survive across devices/browsers and so
 * the AI agent (which runs server-side and cannot read localStorage) can see
 * them. localStorage remains a fast local cache. Writes are fire-and-forget; the
 * optimistic local update already drove the UI.
 */
function mirrorServiceRequestToServer(row: ServiceRequest): void {
  if (typeof window === "undefined") return;
  void fetch("/api/portal-service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

function deleteServiceRequestFromServer(id: string): void {
  if (typeof window === "undefined") return;
  void fetch("/api/portal-service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => undefined);
}

/** Pull the authoritative server set into the local cache and notify listeners. */
export async function syncServiceRequestsFromServer(opts?: { force?: boolean }): Promise<ServiceRequest[]> {
  if (typeof window === "undefined") return [];
  const force = opts?.force === true;
  if (!force && serviceRequestsSyncPromise) return serviceRequestsSyncPromise;
  if (!force && serviceRequestsLastSyncedAt > 0 && Date.now() - serviceRequestsLastSyncedAt < SERVICE_REQUESTS_SYNC_TTL_MS) {
    return readAll();
  }
  try {
    serviceRequestsSyncPromise = (async () => {
      const res = await fetch("/api/portal-service-requests", { credentials: "include" });
      if (!res.ok) return readAll();
      const body = (await res.json()) as { rows?: ServiceRequest[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      writeAll(rows);
      serviceRequestsLastSyncedAt = Date.now();
      return rows;
    })();
    return await serviceRequestsSyncPromise;
  } catch {
    return readAll();
  } finally {
    serviceRequestsSyncPromise = null;
  }
}

export function createServiceRequest(
  req: Omit<ServiceRequest, "id" | "requestedAt" | "status" | "servicePaid" | "depositPaid">,
): ServiceRequest {
  const newReq: ServiceRequest = {
    ...req,
    id: `SR-${Date.now()}`,
    requestedAt: new Date().toISOString(),
    status: "pending",
    servicePaid: false,
    depositPaid: false,
  };
  writeAll([newReq, ...readAll()]);
  mirrorServiceRequestToServer(newReq);
  return newReq;
}

export function readServiceRequestsForResident(residentEmail: string): ServiceRequest[] {
  const email = residentEmail.trim().toLowerCase();
  return readAll().filter((r) => r.residentEmail.trim().toLowerCase() === email);
}

export function readServiceRequestsForManager(managerUserId: string): ServiceRequest[] {
  return readAll().filter((r) => r.managerUserId === managerUserId);
}

export function readServiceRequestsForProperty(propertyId: string): ServiceRequest[] {
  const propId = propertyId.trim().toLowerCase();
  return readAll().filter((r) => r.propertyId.trim().toLowerCase() === propId);
}

export function updateServiceRequest(id: string, updates: Partial<ServiceRequest>): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx]!, ...updates };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function approveServiceRequest(id: string, managerNote?: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const row = all[idx]!;
  const propertyLabel = resolvePropertyLabel(row.propertyId);

  let serviceChargeId = row.serviceChargeId;
  let depositChargeId = row.depositChargeId;

  if (!serviceChargeId) {
    const serviceAmount = toPositiveDollarAmount(row.price);
    if (serviceAmount) {
      const createdServiceCharge = createManagerCharge({
        residentEmail: row.residentEmail,
        residentName: row.residentName,
        propertyId: row.propertyId,
        propertyLabel,
        managerUserId: row.managerUserId,
        title: `${row.offerName} service fee`,
        amount: serviceAmount,
        blocksLeaseUntilPaid: false,
      });
      if (createdServiceCharge) serviceChargeId = createdServiceCharge.id;
    }
  }

  if (!depositChargeId) {
    const depositAmount = toPositiveDollarAmount(row.deposit);
    if (depositAmount) {
      const createdDepositCharge = createManagerCharge({
        residentEmail: row.residentEmail,
        residentName: row.residentName,
        propertyId: row.propertyId,
        propertyLabel,
        managerUserId: row.managerUserId,
        title: `${row.offerName} refundable deposit`,
        amount: depositAmount,
        blocksLeaseUntilPaid: false,
      });
      if (createdDepositCharge) depositChargeId = createdDepositCharge.id;
    }
  }

  all[idx] = {
    ...row,
    status: "approved",
    approvedAt: new Date().toISOString(),
    managerNote: managerNote?.trim() || row.managerNote,
    serviceChargeId,
    depositChargeId,
  };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function denyServiceRequest(id: string, managerNote?: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx]!,
    status: "denied",
    deniedAt: new Date().toISOString(),
    managerNote: managerNote?.trim() || all[idx]!.managerNote,
  };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function markServiceRequestServicePaid(id: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const row = all[idx]!;
  if (row.serviceChargeId) {
    markHouseholdChargePaid(row.serviceChargeId, row.managerUserId ?? null);
  }
  all[idx] = { ...row, servicePaid: true, servicePaidAt: new Date().toISOString() };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function markServiceRequestDepositPaid(id: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx]!, depositPaid: true, depositPaidAt: new Date().toISOString() };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function deleteServiceRequest(id: string): void {
  const all = readAll();
  const target = all.find((r) => r.id === id);
  if (target?.serviceChargeId && !target.servicePaid) {
    deleteHouseholdCharge(target.serviceChargeId, target.managerUserId ?? null);
  }
  if (target?.depositChargeId && !target.depositPaid) {
    deleteHouseholdCharge(target.depositChargeId, target.managerUserId ?? null);
  }
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return;
  writeAll(next);
  deleteServiceRequestFromServer(id);
}

export function deleteServiceRequestsForResident(residentEmail: string): number {
  const email = residentEmail.trim().toLowerCase();
  if (!email) return 0;
  const all = readAll();
  const removedRows = all.filter((r) => r.residentEmail.trim().toLowerCase() === email);
  const next = all.filter((r) => r.residentEmail.trim().toLowerCase() !== email);
  const removed = all.length - next.length;
  if (removed > 0) {
    writeAll(next);
    for (const row of removedRows) deleteServiceRequestFromServer(row.id);
  }
  return removed;
}

export function submitReturnPhoto(id: string, photoDataUrl: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx]!,
    status: "returned",
    returnPhotoDataUrl: photoDataUrl,
    returnedAt: new Date().toISOString(),
  };
  writeAll(all);
  mirrorServiceRequestToServer(all[idx]!);
}

export function hasDeposit(deposit: string): boolean {
  const trimmed = deposit.trim();
  if (!trimmed) return false;
  const n = parseFloat(trimmed.replace(/[^\d.]/g, ""));
  if (Number.isNaN(n)) return true; // non-numeric but present, treat as has deposit
  return n > 0;
}
