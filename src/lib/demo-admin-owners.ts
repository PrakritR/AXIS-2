import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

let ownerRows: AdminOwnerRow[] = [];

export type AdminOwnerRow = {
  id: string;
  name: string;
  email: string;
  status: "current" | "past";
};

function isBrowser() {
  return typeof window !== "undefined";
}

function write(rows: AdminOwnerRow[]) {
  if (!isBrowser()) return;
  ownerRows = rows;
  window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
}

export function readAdminOwners(): AdminOwnerRow[] {
  return ownerRows;
}

export function adminOwnerCounts() {
  const rows = readAdminOwners();
  const current = rows.filter((r) => r.status === "current").length;
  const past = rows.filter((r) => r.status === "past").length;
  return { current, past, total: rows.length };
}
