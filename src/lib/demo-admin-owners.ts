const ownerRows: AdminOwnerRow[] = [];

export type AdminOwnerRow = {
  id: string;
  name: string;
  email: string;
  status: "current" | "past";
};

export function readAdminOwners(): AdminOwnerRow[] {
  return ownerRows;
}

export function adminOwnerCounts() {
  const rows = readAdminOwners();
  const current = rows.filter((r) => r.status === "current").length;
  const past = rows.filter((r) => r.status === "past").length;
  return { current, past, total: rows.length };
}
