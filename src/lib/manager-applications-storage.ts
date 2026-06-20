import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const MANAGER_APPLICATIONS_EVENT = "axis:manager-applications";
const MANAGER_APPLICATIONS_SESSION_KEY_PREFIX = "axis:manager-applications:v2";

const EMPTY_FALLBACK: DemoApplicantRow[] = [];
let memoryRows: DemoApplicantRow[] = [];
let activeApplicationsScopeUserId: string | undefined;
const MANAGER_APPLICATIONS_SYNC_TTL_MS = 15_000;
let managerApplicationsLastSyncedAt = 0;
let managerApplicationsSyncPromise: Promise<DemoApplicantRow[]> | null = null;
let publicApprovedApplicationsLastSyncedAt = 0;
let publicApprovedApplicationsSyncPromise: Promise<DemoApplicantRow[]> | null = null;

export function normalizeApplicationAxisId(id: string): string {
  const raw = id.trim();
  if (!raw) return raw;
  if (raw.toUpperCase().startsWith("AXIS-")) return raw;
  const suffix = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  return `AXIS-${suffix || Date.now().toString(36).toUpperCase()}`;
}

/** Opens Property Portal → Applications with this primary application expanded. */
export function buildPortalApplicationOpenHref(axisId: string): string {
  const id = normalizeApplicationAxisId(axisId.trim()).toUpperCase();
  if (!id) return "/portal/applications";
  return `/portal/applications?open=${encodeURIComponent(id)}`;
}

/** Same application id shown in property portal + create-account; not derived from auth user UUID. */
export function resolveResidentPortalAxisId(input: {
  profileManagerId?: string | null;
  authUserAxisId?: string | null;
  applicationRowId?: string | null;
}): string {
  const fromProfile = input.profileManagerId?.trim();
  if (fromProfile) return normalizeApplicationAxisId(fromProfile);
  const fromAuth = typeof input.authUserAxisId === "string" ? input.authUserAxisId.trim() : "";
  if (fromAuth) return normalizeApplicationAxisId(fromAuth);
  const fromRow = input.applicationRowId?.trim();
  if (fromRow) return normalizeApplicationAxisId(fromRow);
  return "";
}

function normalizeApplicationRow(row: DemoApplicantRow): DemoApplicantRow {
  const nextId = normalizeApplicationAxisId(row.id);
  const next = nextId === row.id ? row : { ...row, id: nextId };
  return syncSignedRentFields(next);
}

function parseSignedRentValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
  }
  return null;
}

function syncSignedRentFields(row: DemoApplicantRow): DemoApplicantRow {
  const signedMonthlyRent = parseSignedRentValue(row.signedMonthlyRent);
  const applicationRent = parseSignedRentValue(row.application?.managerRentOverride);
  const canonicalRent = signedMonthlyRent ?? applicationRent;
  if (canonicalRent == null) return row;

  return {
    ...row,
    signedMonthlyRent: canonicalRent,
    application: row.application
      ? {
          ...row.application,
          managerRentOverride: String(canonicalRent),
        }
      : row.application,
  };
}

function normalizeApplicationRows(rows: DemoApplicantRow[]): DemoApplicantRow[] {
  const byId = new Map<string, DemoApplicantRow>();
  for (const row of rows) {
    const normalized = normalizeApplicationRow(row);
    byId.set(normalized.id, { ...byId.get(normalized.id), ...normalized });
  }
  return [...byId.values()];
}

function applicationRowsChanged(a: DemoApplicantRow[], b: DemoApplicantRow[]) {
  return JSON.stringify(normalizeApplicationRows(a)) !== JSON.stringify(normalizeApplicationRows(b));
}

function chooseString(primary: string | undefined, fallback: string | undefined): string | undefined {
  const p = primary?.trim();
  if (p) return primary;
  const f = fallback?.trim();
  if (f) return fallback;
  return primary ?? fallback;
}

function chooseNumber(primary: number | null | undefined, fallback: number | null | undefined): number | null | undefined {
  return primary ?? fallback;
}

function mergeApplicationRow(existing: DemoApplicantRow | undefined, incoming: DemoApplicantRow): DemoApplicantRow {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    name: chooseString(incoming.name, existing.name) ?? "",
    property: chooseString(incoming.property, existing.property) ?? "",
    stage: chooseString(incoming.stage, existing.stage) ?? "",
    detail: chooseString(incoming.detail, existing.detail) ?? "",
    email: chooseString(incoming.email, existing.email),
    propertyId: chooseString(incoming.propertyId, existing.propertyId),
    assignedPropertyId: chooseString(incoming.assignedPropertyId, existing.assignedPropertyId),
    assignedRoomChoice: chooseString(incoming.assignedRoomChoice, existing.assignedRoomChoice),
    managerUserId: chooseString(incoming.managerUserId ?? undefined, existing.managerUserId ?? undefined) ?? null,
    moveInInstructions: chooseString(incoming.moveInInstructions, existing.moveInInstructions),
    signedMonthlyRent: chooseNumber(incoming.signedMonthlyRent, existing.signedMonthlyRent),
    manuallyAdded: incoming.manuallyAdded ?? existing.manuallyAdded,
    application: incoming.application ?? existing.application,
    manualResidentDetails: incoming.manualResidentDetails ?? existing.manualResidentDetails,
  };
}

function mergeApplicationRows(existingRows: DemoApplicantRow[], incomingRows: DemoApplicantRow[]): DemoApplicantRow[] {
  const existingById = new Map(normalizeApplicationRows(existingRows).map((row) => [row.id, row] as const));
  return normalizeApplicationRows(
    incomingRows.map((row) => {
      const normalized = normalizeApplicationRow(row);
      return mergeApplicationRow(existingById.get(normalized.id), normalized);
    }),
  );
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function managerApplicationsSessionKey(scopeUserId?: string | null): string {
  if (scopeUserId) return `${MANAGER_APPLICATIONS_SESSION_KEY_PREFIX}:${scopeUserId}`;
  return `${MANAGER_APPLICATIONS_SESSION_KEY_PREFIX}:shared`;
}

function ensureApplicationsScope(scopeUserId?: string | null) {
  const nextScope = scopeUserId ?? undefined;
  if (activeApplicationsScopeUserId !== nextScope) {
    activeApplicationsScopeUserId = nextScope;
    memoryRows = [];
    managerApplicationsLastSyncedAt = 0;
  }
}

function hydrateManagerApplicationsFromSession(scopeUserId?: string | null) {
  if (!canUseStorage()) return;
  if (memoryRows.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(managerApplicationsSessionKey(scopeUserId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as DemoApplicantRow[];
    if (!Array.isArray(parsed)) return;
    memoryRows = normalizeApplicationRows(parsed);
  } catch {
    /* ignore */
  }
}

function persistManagerApplicationsToSession(rows: DemoApplicantRow[], scopeUserId?: string | null) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(
      managerApplicationsSessionKey(scopeUserId ?? activeApplicationsScopeUserId),
      JSON.stringify(rows),
    );
  } catch {
    /* ignore */
  }
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

export function upsertApplicationRowToServer(row: DemoApplicantRow): void {
  mirrorApplicationRowToServer(row);
}

export async function deleteManagerApplicationFromServer(id: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !id.trim()) return { ok: false, error: "Application ID is required." };
  try {
    const res = await fetch("/api/manager-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "delete", id }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: body?.error ?? "Could not delete application." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete application." };
  }
}

export async function syncManagerApplicationsFromServer(opts?: {
  force?: boolean;
  managerUserId?: string | null;
}): Promise<DemoApplicantRow[]> {
  if (!canUseStorage()) return [];
  const managerUserId = opts?.managerUserId ?? undefined;
  ensureApplicationsScope(managerUserId);
  hydrateManagerApplicationsFromSession(managerUserId);
  const force = opts?.force === true;
  if (!force && managerApplicationsSyncPromise) return managerApplicationsSyncPromise;
  if (!force && managerApplicationsLastSyncedAt > 0 && Date.now() - managerApplicationsLastSyncedAt < MANAGER_APPLICATIONS_SYNC_TTL_MS) {
    return readManagerApplicationRows();
  }
  try {
    managerApplicationsSyncPromise = (async () => {
      const res = await fetch("/api/manager-applications", { credentials: "include" });
      if (!res.ok) return readManagerApplicationRows();
      const body = (await res.json()) as { rows?: DemoApplicantRow[] };
      const rows = mergeApplicationRows([], Array.isArray(body.rows) ? body.rows : []);
      const changed = applicationRowsChanged(memoryRows, rows);
      memoryRows = rows;
      persistManagerApplicationsToSession(rows, managerUserId);
      managerApplicationsLastSyncedAt = Date.now();
      if (changed) emit();
      return rows;
    })();
    return await managerApplicationsSyncPromise;
  } catch {
    return readManagerApplicationRows();
  } finally {
    managerApplicationsSyncPromise = null;
  }
}

export async function syncPublicApprovedApplicationsFromServer(opts?: { force?: boolean }): Promise<DemoApplicantRow[]> {
  if (!canUseStorage()) return [];
  const force = opts?.force === true;
  if (!force && publicApprovedApplicationsSyncPromise) return publicApprovedApplicationsSyncPromise;
  if (!force && publicApprovedApplicationsLastSyncedAt > 0 && Date.now() - publicApprovedApplicationsLastSyncedAt < MANAGER_APPLICATIONS_SYNC_TTL_MS) {
    return readManagerApplicationRows();
  }
  try {
    publicApprovedApplicationsSyncPromise = (async () => {
      const res = await fetch("/api/public/approved-room-occupancy", { cache: "no-store" });
      if (!res.ok) return readManagerApplicationRows();
      const body = (await res.json()) as { rows?: DemoApplicantRow[] };
      const rows = mergeApplicationRows(memoryRows, Array.isArray(body.rows) ? body.rows : []);
      memoryRows = rows;
      publicApprovedApplicationsLastSyncedAt = Date.now();
      return rows;
    })();
    return await publicApprovedApplicationsSyncPromise;
  } catch {
    return readManagerApplicationRows();
  } finally {
    publicApprovedApplicationsSyncPromise = null;
  }
}

export function readManagerApplicationRows(fallback: DemoApplicantRow[] = EMPTY_FALLBACK): DemoApplicantRow[] {
  hydrateManagerApplicationsFromSession(activeApplicationsScopeUserId);
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
    if (!applicationRowsChanged(memoryRows, normalizedRows)) return;
    memoryRows = normalizedRows;
    persistManagerApplicationsToSession(normalizedRows, activeApplicationsScopeUserId);
    managerApplicationsLastSyncedAt = Date.now();
    emit();
    mirrorApplicationsToServer(normalizedRows);
    void import("@/lib/lease-pipeline-storage").then(({ syncLeasePipelineFromApplications }) => {
      syncLeasePipelineFromApplications(activeApplicationsScopeUserId ?? null);
    });
  } catch {
    /* ignore */
  }
}

export function resetManagerApplicationRowsToDemo(): void {
  memoryRows = [];
  if (canUseStorage()) {
    window.sessionStorage.removeItem(managerApplicationsSessionKey(activeApplicationsScopeUserId));
  }
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
