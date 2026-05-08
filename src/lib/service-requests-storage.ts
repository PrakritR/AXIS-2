export const SERVICE_REQUESTS_EVENT = "axis:service-requests";
const KEY = "axis_service_requests_v1";

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
  // Return
  returnPhotoDataUrl?: string;
  returnedAt?: string;
};

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
  return newReq;
}

export function readServiceRequestsForResident(residentEmail: string): ServiceRequest[] {
  const email = residentEmail.trim().toLowerCase();
  return readAll().filter((r) => r.residentEmail.trim().toLowerCase() === email);
}

export function readServiceRequestsForManager(managerUserId: string): ServiceRequest[] {
  return readAll().filter((r) => r.managerUserId === managerUserId);
}

export function approveServiceRequest(id: string, managerNote?: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = {
    ...all[idx]!,
    status: "approved",
    approvedAt: new Date().toISOString(),
    managerNote: managerNote?.trim() || all[idx]!.managerNote,
  };
  writeAll(all);
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
}

export function markServiceRequestServicePaid(id: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx]!, servicePaid: true, servicePaidAt: new Date().toISOString() };
  writeAll(all);
}

export function markServiceRequestDepositPaid(id: string): void {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx]!, depositPaid: true, depositPaidAt: new Date().toISOString() };
  writeAll(all);
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
}

export function hasDeposit(deposit: string): boolean {
  const trimmed = deposit.trim();
  if (!trimmed) return false;
  const n = parseFloat(trimmed.replace(/[^\d.]/g, ""));
  if (Number.isNaN(n)) return true; // non-numeric but present, treat as has deposit
  return n > 0;
}
