import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

const KEY = "axis_admin_owners_demo_v1";

export type AdminOwnerRow = {
  id: string;
  name: string;
  email: string;
  status: "current" | "past";
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(rows: AdminOwnerRow[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore */
  }
}

export function readAdminOwners(): AdminOwnerRow[] {
  const rows = readJson<AdminOwnerRow[] | null>(KEY, null);
  if (rows === null) {
    write([]);
    return [];
  }
  return rows;
}

export function adminOwnerCounts() {
  const rows = readAdminOwners();
  const current = rows.filter((r) => r.status === "current").length;
  const past = rows.filter((r) => r.status === "past").length;
  return { current, past, total: rows.length };
}
