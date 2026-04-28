import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

const KEY = "axis_manager_applications_v1";
export const MANAGER_APPLICATIONS_EVENT = "axis:manager-applications";

const EMPTY_FALLBACK: DemoApplicantRow[] = [];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length > 0) {
      window.localStorage.setItem(KEY, JSON.stringify(rows));
      emit();
    } else {
      const localRows = readManagerApplicationRows();
      if (localRows.length > 0) mirrorApplicationsToServer(localRows);
    }
    return rows;
  } catch {
    return readManagerApplicationRows();
  }
}

export function readManagerApplicationRows(fallback: DemoApplicantRow[] = EMPTY_FALLBACK): DemoApplicantRow[] {
  if (!canUseStorage()) return [...fallback];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...fallback];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.length === 0) return [...fallback];
    const stored = v as DemoApplicantRow[];
    return stored.map((r) => {
      const seed = fallback.find((f) => f.id === r.id);
      if (!seed) return r;
      return {
        ...seed,
        ...r,
        application: r.application ?? seed.application,
      };
    });
  } catch {
    return [...fallback];
  }
}

export function writeManagerApplicationRows(rows: DemoApplicantRow[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    emit();
    mirrorApplicationsToServer(rows);
    void import("@/lib/lease-pipeline-storage").then(({ readLeasePipeline }) => {
      readLeasePipeline();
    });
  } catch {
    /* quota */
  }
}

export function resetManagerApplicationRowsToDemo(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(KEY);
  emit();
}

/** Append one application (e.g. after resident submit). Skips if the same id already exists. */
export function appendManagerApplicationRow(row: DemoApplicantRow): void {
  const rows = readManagerApplicationRows();
  if (rows.some((r) => r.id === row.id)) return;
  const next = [...rows, row];
  writeManagerApplicationRows(next);
  mirrorApplicationRowToServer(row);
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
