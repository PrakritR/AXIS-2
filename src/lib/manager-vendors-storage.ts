import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { VendorDocumentRecord } from "@/lib/vendor-documents";

export type ManagerVendorRow = {
  id: string;
  managerUserId: string | null;
  name: string;
  /** Legacy single-trade field, still set by the manager's Add/Edit vendor form. */
  trade: string;
  /** Vendor self-selected work capabilities (multi-select); falls back to [trade] when unset. */
  trades?: string[];
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  propertyIds?: string[];
  /** When true, other managers on Axis can use this vendor for work orders. */
  sharedWithManagers?: boolean;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  /** ISO date (yyyy-mm-dd) the vendor's insurance coverage expires. */
  insuranceExpiresAt?: string;
  /** Uploaded compliance files (insurance cert, W-9 PDF, license). */
  vendorDocuments?: VendorDocumentRecord[];
  /** When true, managers can pay this vendor via Zelle using `zelleContact`. */
  zellePaymentsEnabled?: boolean;
  zelleContact?: string;
  /** When true, managers can pay this vendor via Venmo using `venmoContact`. */
  venmoPaymentsEnabled?: boolean;
  venmoContact?: string;
  /** When true, vendor accepts bank transfer via Stripe Connect (link bank in Payments). */
  achPaymentsEnabled?: boolean;
  /** Derived snapshot of enabled payout methods (zelle / venmo / ach). */
  acceptedPaymentMethods?: ("zelle" | "venmo" | "ach")[];
  createdAt?: string;
  updatedAt?: string;
};

export const MANAGER_VENDORS_EVENT = "axis:manager-vendors";
const MANAGER_VENDORS_SESSION_KEY = "axis:manager-vendors:v1";

const EMPTY_FALLBACK: ManagerVendorRow[] = [];
let memoryRows: ManagerVendorRow[] = [];
const MANAGER_VENDORS_SYNC_TTL_MS = 15_000;
let managerVendorsLastSyncedAt = 0;
let managerVendorsSyncPromise: Promise<ManagerVendorRow[]> | null = null;

function vendorRowsChanged(a: ManagerVendorRow[], b: ManagerVendorRow[]) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function hydrateVendorsFromSession() {
  if (!canUseStorage() || memoryRows.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(MANAGER_VENDORS_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ManagerVendorRow[];
    if (Array.isArray(parsed)) memoryRows = parsed;
  } catch {
    /* ignore */
  }
}

function persistVendorsToSession(rows: ManagerVendorRow[]) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(MANAGER_VENDORS_SESSION_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(MANAGER_VENDORS_EVENT));
}

function ownVendorRows(rows: ManagerVendorRow[], managerUserId: string | null | undefined): ManagerVendorRow[] {
  if (!managerUserId) return rows;
  return rows.filter((r) => r.managerUserId === managerUserId || r.managerUserId == null);
}

function mirrorVendorsToServer(rows: ManagerVendorRow[], managerUserId?: string | null) {
  if (typeof window === "undefined" || isDemoModeActive()) return;
  const payload = managerUserId ? ownVendorRows(rows, managerUserId) : rows;
  void fetch("/api/portal-vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "replace", rows: payload }),
  }).catch(() => undefined);
}

function mirrorVendorRowToServer(row: ManagerVendorRow) {
  if (typeof window === "undefined" || isDemoModeActive()) return;
  void fetch("/api/portal-vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

function deleteVendorFromServer(id: string) {
  if (typeof window === "undefined" || isDemoModeActive()) return;
  void fetch("/api/portal-vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => undefined);
}

export function makeVendorId(): string {
  return `vendor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function syncManagerVendorsFromServer(opts?: { force?: boolean }): Promise<ManagerVendorRow[]> {
  if (!canUseStorage()) return [];
  hydrateVendorsFromSession();
  if (isDemoModeActive()) return readManagerVendorRows();
  const force = opts?.force === true;
  if (!force && managerVendorsSyncPromise) return managerVendorsSyncPromise;
  if (!force && managerVendorsLastSyncedAt > 0 && Date.now() - managerVendorsLastSyncedAt < MANAGER_VENDORS_SYNC_TTL_MS) {
    return readManagerVendorRows();
  }
  try {
    managerVendorsSyncPromise = (async () => {
      const res = await fetch("/api/portal-vendors", { credentials: "include" });
      if (!res.ok) return readManagerVendorRows();
      const body = (await res.json()) as { rows?: ManagerVendorRow[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const changed = vendorRowsChanged(memoryRows, rows);
      memoryRows = rows;
      persistVendorsToSession(rows);
      managerVendorsLastSyncedAt = Date.now();
      if (changed) emit();
      return rows;
    })();
    return await managerVendorsSyncPromise;
  } catch {
    return readManagerVendorRows();
  } finally {
    managerVendorsSyncPromise = null;
  }
}

export function readManagerVendorRows(fallback: ManagerVendorRow[] = EMPTY_FALLBACK): ManagerVendorRow[] {
  hydrateVendorsFromSession();
  if (memoryRows.length === 0) return [...fallback];
  return memoryRows;
}

export function readActiveManagerVendorRows(fallback: ManagerVendorRow[] = EMPTY_FALLBACK): ManagerVendorRow[] {
  return readManagerVendorRows(fallback).filter((v) => v.active !== false);
}

/** Demo seed: load vendor rows into the local store without server mirror. */
export function seedDemoManagerVendorRows(rows: ManagerVendorRow[]): void {
  if (!canUseStorage()) return;
  memoryRows = rows;
  persistVendorsToSession(rows);
  managerVendorsLastSyncedAt = Date.now();
  emit();
}

export function writeManagerVendorRows(rows: ManagerVendorRow[], managerUserId?: string | null): void {
  if (!vendorRowsChanged(memoryRows, rows)) return;
  memoryRows = rows;
  persistVendorsToSession(rows);
  managerVendorsLastSyncedAt = Date.now();
  emit();
  mirrorVendorsToServer(rows, managerUserId);
}

export function upsertManagerVendor(row: ManagerVendorRow, managerUserId?: string | null): void {
  const rows = readManagerVendorRows();
  const idx = rows.findIndex((r) => r.id === row.id);
  const next = idx === -1 ? [...rows, row] : rows.map((r, i) => (i === idx ? row : r));
  writeManagerVendorRows(next, managerUserId ?? row.managerUserId);
  mirrorVendorRowToServer(row);
}

export function deleteManagerVendorRow(id: string, managerUserId?: string | null): boolean {
  const rows = readManagerVendorRows();
  const target = rows.find((r) => r.id === id);
  if (!target) return false;
  if (managerUserId && target.managerUserId && target.managerUserId !== managerUserId) return false;
  writeManagerVendorRows(rows.filter((r) => r.id !== id), managerUserId);
  deleteVendorFromServer(id);
  return true;
}

export function filterOwnVendorRowsForSync(
  rows: ManagerVendorRow[],
  managerUserId: string | null | undefined,
): ManagerVendorRow[] {
  return ownVendorRows(rows, managerUserId);
}

export function subscribeManagerVendors(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MANAGER_VENDORS_EVENT, cb);
  return () => window.removeEventListener(MANAGER_VENDORS_EVENT, cb);
}
