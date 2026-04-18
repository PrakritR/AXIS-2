import { emitAdminUi } from "@/lib/demo-admin-ui";

const STORAGE_KEY = "axis_demo_resident_charges_v1";

export type ResidentCharge = {
  id: string;
  applicationId: string;
  residentEmailNorm: string;
  title: string;
  amountCents: number;
  note: string;
  createdAt: string;
  createdBy: "manager";
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function readAll(): ResidentCharge[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as ResidentCharge[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: ResidentCharge[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

export function listChargesForResidentEmail(residentEmail: string): ResidentCharge[] {
  const n = normEmail(residentEmail);
  return readAll()
    .filter((c) => c.residentEmailNorm === n)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function listChargesForApplication(applicationId: string): ResidentCharge[] {
  return readAll()
    .filter((c) => c.applicationId === applicationId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function managerAddPaymentCharge(payload: {
  applicationId: string;
  residentEmail: string;
  title: string;
  amountCents: number;
  note?: string;
}): ResidentCharge {
  const row: ResidentCharge = {
    id: crypto.randomUUID(),
    applicationId: payload.applicationId,
    residentEmailNorm: normEmail(payload.residentEmail),
    title: payload.title.trim(),
    amountCents: Math.max(0, Math.round(payload.amountCents)),
    note: (payload.note ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
  const rows = readAll();
  rows.unshift(row);
  writeAll(rows);
  return row;
}
