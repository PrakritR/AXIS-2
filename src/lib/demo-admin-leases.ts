import { leasePipelineBucketCounts } from "@/lib/lease-pipeline-storage";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

const KEY = "axis_admin_leases_v1";

/** Public sample PDF for preview/download demos (embed may depend on browser). */
export const DEMO_LEASE_PDF_URL =
  "https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf";

export type AdminLeaseBucketIndex = 0 | 1 | 2 | 3;

export type AdminLeaseRow = {
  id: string;
  propertyLabel: string;
  addressLine: string;
  rentLabel: string;
  bucket: AdminLeaseBucketIndex;
  managerName: string;
  propertyGroup: string;
  residentName: string;
  pdfUrl: string;
  uploadedPdfDataUrl: string | null;
  comments: string;
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

function write(rows: AdminLeaseRow[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  } catch {
    /* ignore */
  }
}

function normalizeAdminLeaseRow(raw: Partial<AdminLeaseRow> & { id?: string }): AdminLeaseRow | null {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (!id) return null;
  const bucketNum = typeof raw.bucket === "number" && raw.bucket >= 0 && raw.bucket <= 3 ? raw.bucket : 0;
  return {
    id,
    propertyLabel: typeof raw.propertyLabel === "string" ? raw.propertyLabel : "",
    addressLine: typeof raw.addressLine === "string" ? raw.addressLine : "",
    rentLabel: typeof raw.rentLabel === "string" ? raw.rentLabel : "",
    bucket: bucketNum as AdminLeaseBucketIndex,
    managerName: typeof raw.managerName === "string" ? raw.managerName : "",
    propertyGroup: typeof raw.propertyGroup === "string" ? raw.propertyGroup : "",
    residentName: typeof raw.residentName === "string" ? raw.residentName : "",
    pdfUrl: typeof raw.pdfUrl === "string" ? raw.pdfUrl : DEMO_LEASE_PDF_URL,
    uploadedPdfDataUrl: raw.uploadedPdfDataUrl ?? null,
    comments: typeof raw.comments === "string" ? raw.comments : "",
  };
}

export function readAdminLeases(): AdminLeaseRow[] {
  const raw = readJson<unknown>(KEY, null);
  if (raw === null) {
    write([]);
    return [];
  }
  if (!Array.isArray(raw)) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }
    return [];
  }
  const out: AdminLeaseRow[] = [];
  for (const item of raw) {
    const row = normalizeAdminLeaseRow((item ?? {}) as Partial<AdminLeaseRow>);
    if (row) out.push(row);
  }
  return out;
}

export function adminLeaseKpiCounts(): [number, number, number, number] {
  try {
    if (typeof window !== "undefined") {
      try {
        return leasePipelineBucketCounts();
      } catch {
        /* fall through to legacy admin lease rows */
      }
    }
    const rows = readAdminLeases();
    return [
      rows.filter((r) => r.bucket === 0).length,
      rows.filter((r) => r.bucket === 1).length,
      rows.filter((r) => r.bucket === 2).length,
      rows.filter((r) => r.bucket === 3).length,
    ];
  } catch {
    return [0, 0, 0, 0];
  }
}

export function updateAdminLease(id: string, patch: Partial<AdminLeaseRow>): boolean {
  const rows = readAdminLeases();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = [...rows];
  next[idx] = { ...next[idx]!, ...patch };
  write(next);
  return true;
}

/** Append a generated lease (e.g. from a server action). */
export function appendAdminLease(row: AdminLeaseRow): void {
  const rows = readAdminLeases();
  write([
    ...rows,
    {
      ...row,
      pdfUrl: row.pdfUrl || DEMO_LEASE_PDF_URL,
      uploadedPdfDataUrl: row.uploadedPdfDataUrl ?? null,
      comments: row.comments ?? "",
    },
  ]);
}

export function filterAdminLeases(
  rows: AdminLeaseRow[],
  bucket: AdminLeaseBucketIndex,
  propertyFilter: string,
  managerFilter: string,
  q: string,
): AdminLeaseRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (r.bucket !== bucket) return false;
    if (propertyFilter !== "all" && r.propertyGroup !== propertyFilter) return false;
    if (managerFilter !== "all" && r.managerName !== managerFilter) return false;
    if (!needle) return true;
    const hay = [r.propertyLabel, r.addressLine, r.residentName, r.managerName].map((s) =>
      typeof s === "string" ? s.toLowerCase() : "",
    );
    return hay.some((h) => h.includes(needle));
  });
}

export function uniquePropertyGroups(rows: AdminLeaseRow[]): string[] {
  return [...new Set(rows.map((r) => r.propertyGroup))].sort();
}

export function uniqueManagerNames(rows: AdminLeaseRow[]): string[] {
  return [...new Set(rows.map((r) => r.managerName))].sort();
}
