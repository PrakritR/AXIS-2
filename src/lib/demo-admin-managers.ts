import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

const KEY = "axis_admin_managers_demo_v1";

export type AdminManagerRow = {
  id: string;
  name: string;
  email: string;
  accountType: string;
  joinedLabel: string;
  propertyGroup: string;
  status: "active" | "disabled";
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

function write(rows: AdminManagerRow[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore */
  }
}

export function readAdminManagers(): AdminManagerRow[] {
  const raw = readJson<unknown>(KEY, null);
  if (raw === null) {
    write([]);
    return [];
  }
  if (!Array.isArray(raw)) {
    write([]);
    return [];
  }
  return raw as AdminManagerRow[];
}

export function adminManagerCounts() {
  const rows = readAdminManagers();
  const current = rows.filter((r) => r.status === "active").length;
  const past = rows.filter((r) => r.status === "disabled").length;
  return { current, past, total: rows.length };
}

export function setManagerStatus(id: string, status: "active" | "disabled"): boolean {
  const rows = readAdminManagers();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = rows.map((r) => (r.id === id ? { ...r, status } : r));
  write(next);
  return true;
}

export function filterManagers(rows: AdminManagerRow[], q: string, propertyFilter: string) {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (propertyFilter !== "all" && r.propertyGroup !== propertyFilter) return false;
    if (!needle) return true;
    return (
      String(r.name ?? "").toLowerCase().includes(needle) ||
      String(r.email ?? "").toLowerCase().includes(needle) ||
      String(r.accountType ?? "").toLowerCase().includes(needle)
    );
  });
}
