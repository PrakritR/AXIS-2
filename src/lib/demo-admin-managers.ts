import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

let managerRows: AdminManagerRow[] = [];

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
  return typeof window !== "undefined";
}

function write(rows: AdminManagerRow[]) {
  if (!isBrowser()) return;
  managerRows = rows;
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
}

export function readAdminManagers(): AdminManagerRow[] {
  return managerRows;
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
