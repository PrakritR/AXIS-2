import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const MANAGER_APPLICATIONS_EVENT = "axis:manager-applications";

const EMPTY_FALLBACK: DemoApplicantRow[] = [];
let memoryRows: DemoApplicantRow[] = [];

export function normalizeApplicationAxisId(id: string): string {
  const raw = id.trim();
  if (!raw) return raw;
  if (raw.toUpperCase().startsWith("AXIS-")) return raw;
  const suffix = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  return `AXIS-${suffix || Date.now().toString(36).toUpperCase()}`;
}

function normalizeApplicationRow(row: DemoApplicantRow): DemoApplicantRow {
  const nextId = normalizeApplicationAxisId(row.id);
  return nextId === row.id ? row : { ...row, id: nextId };
}

function normalizeApplicationRows(rows: DemoApplicantRow[]): DemoApplicantRow[] {
  const byId = new Map<string, DemoApplicantRow>();
  for (const row of rows) {
    const normalized = normalizeApplicationRow(row);
    byId.set(normalized.id, { ...byId.get(normalized.id), ...normalized });
  }
  return [...byId.values()];
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(MANAGER_APPLICATIONS_EVENT));
}

function mirrorApplicationsToServer(rows: DemoApplicantRow[]) {
  if (typeof window === "undefined") return;
  void fetch("/api/manager-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "replace", rows }),
  }).catch(() => undefined);
}

function mirrorApplicationRowToServer(row: DemoApplicantRow) {
  if (typeof window === "undefined") return;
  void fetch("/api/manager-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

export function deleteManagerApplicationFromServer(id: string) {
  if (typeof window === "undefined" || !id.trim()) return;
  void fetch("/api/manager-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => undefined);
}

export async function syncManagerApplicationsFromServer(): Promise<DemoApplicantRow[]> {
  if (!canUseStorage()) return [];
  try {
    const res = await fetch("/api/manager-applications", { credentials: "include" });
    if (!res.ok) return readManagerApplicationRows();
    const body = (await res.json()) as { rows?: DemoApplicantRow[] };
    const rows = normalizeApplicationRows(Array.isArray(body.rows) ? body.rows : []);
    memoryRows = rows;
    emit();
    return rows;
  } catch {
    return readManagerApplicationRows();
  }
}

export function readManagerApplicationRows(fallback: DemoApplicantRow[] = EMPTY_FALLBACK): DemoApplicantRow[] {
  const stored = normalizeApplicationRows(memoryRows);
  if (stored.length === 0) return [...fallback];
  return stored.map((r) => {
    const seed = fallback.find((f) => f.id === r.id);
    if (!seed) return r;
    return {
      ...seed,
      ...r,
      application: r.application ?? seed.application,
    };
  });
}

export function writeManagerApplicationRows(rows: DemoApplicantRow[]): void {
  try {
    const normalizedRows = normalizeApplicationRows(rows);
    memoryRows = normalizedRows;
    emit();
    mirrorApplicationsToServer(normalizedRows);
    void import("@/lib/lease-pipeline-storage").then(({ readLeasePipeline }) => {
      readLeasePipeline();
    });
  } catch {
    /* ignore */
  }
}

export function resetManagerApplicationRowsToDemo(): void {
  memoryRows = [];
  emit();
}

/** Append one application (e.g. after resident submit). Skips if the same id already exists. */
export function appendManagerApplicationRow(row: DemoApplicantRow): void {
  const normalizedRow = normalizeApplicationRow(row);
  const rows = readManagerApplicationRows();
  if (rows.some((r) => r.id === normalizedRow.id)) return;
  const next = [...rows, normalizedRow];
  writeManagerApplicationRows(next);
  mirrorApplicationRowToServer(normalizedRow);
}

/**
 * Returns the application answers with the manager's final property / room placement
 * applied on top of the original applicant submission.
 */
export function effectiveApplicationForRow(row: Pick<DemoApplicantRow, "application" | "assignedPropertyId" | "assignedRoomChoice" | "signedMonthlyRent">):
  | Partial<RentalWizardFormState>
  | undefined {
  if (!row.application) return undefined;
  const next: Partial<RentalWizardFormState> = { ...row.application };
  const propertyId = row.assignedPropertyId?.trim();
  const roomChoice = row.assignedRoomChoice?.trim();
  if (propertyId) next.propertyId = propertyId;
  if (roomChoice) next.roomChoice1 = roomChoice;
  const signedRentLabel = signedRentLabelForRow(row);
  if (signedRentLabel) {
    (next as Partial<RentalWizardFormState> & { __signedRentLabel?: string }).__signedRentLabel = signedRentLabel;
  }
  return next;
}

export function signedRentLabelForRow(row: Pick<DemoApplicantRow, "signedMonthlyRent">): string | null {
  if (!Number.isFinite(row.signedMonthlyRent ?? NaN) || (row.signedMonthlyRent ?? 0) <= 0) return null;
  return `$${Number(row.signedMonthlyRent).toFixed(2)} / month`;
}
