/**
 * Demo: resident-uploaded lease PDF (data URL) scoped by email in localStorage.
 */

function canUseStorage() {
  return typeof window !== "undefined";
}

export type UploadedOwnLease = {
  id: string;
  dataUrl: string;
  fileName: string;
  uploadedAt: string;
};

const memoryByEmail = new Map<string, UploadedOwnLease[]>();

// TTL + in-flight guard, keyed by email, so remounts and overlapping readers
// for the same resident collapse into one network fetch.
const LEASE_UPLOADS_SYNC_TTL_MS = 15_000;
const leaseUploadsLastSyncedAt = new Map<string, number>();
const leaseUploadsSyncPromise = new Map<string, Promise<UploadedOwnLease[]>>();

function sortUploads(rows: UploadedOwnLease[]) {
  return [...rows].sort((a, b) => {
    const aTs = Date.parse(a.uploadedAt || "");
    const bTs = Date.parse(b.uploadedAt || "");
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

function normalizeUpload(raw: unknown, fallbackEmail: string, fallbackIndex: number): UploadedOwnLease | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<UploadedOwnLease> & { id?: string; row_data?: unknown };
  const payload = row.row_data && typeof row.row_data === "object" ? row.row_data as Partial<UploadedOwnLease> : row;
  const fileName = String(payload.fileName ?? "").trim();
  const dataUrl = String(payload.dataUrl ?? "").trim();
  const uploadedAt = String(payload.uploadedAt ?? "").trim();
  if (!fileName || !dataUrl) return null;
  return {
    id: String(payload.id ?? row.id ?? `lease_upload_${fallbackEmail}_${fallbackIndex}`).trim() || `lease_upload_${fallbackEmail}_${fallbackIndex}`,
    dataUrl,
    fileName,
    uploadedAt: uploadedAt || new Date().toISOString(),
  };
}

export async function syncUploadedOwnLeasesFromServer(email: string, opts?: { force?: boolean }): Promise<UploadedOwnLease[]> {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return [];
  const force = opts?.force === true;
  const inFlight = leaseUploadsSyncPromise.get(key);
  if (!force && inFlight) return inFlight;
  const lastSyncedAt = leaseUploadsLastSyncedAt.get(key) ?? 0;
  if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < LEASE_UPLOADS_SYNC_TTL_MS) {
    return memoryByEmail.get(key) ?? [];
  }
  const promise = (async () => {
    const res = await fetch("/api/portal-resident-lease-uploads", { credentials: "include" });
    if (!res.ok) return memoryByEmail.get(key) ?? [];
    const body = (await res.json()) as { rows?: Array<UploadedOwnLease & { email?: string; residentEmail?: string; row_data?: unknown }> };
    const rows = (body.rows ?? []).filter((candidate) => {
      const rowEmail = String(candidate.email ?? candidate.residentEmail ?? "").trim().toLowerCase();
      return rowEmail === key;
    }).map((candidate, index) => normalizeUpload(candidate, key, index)).filter((candidate): candidate is UploadedOwnLease => Boolean(candidate));
    const sorted = sortUploads(rows);
    memoryByEmail.set(key, sorted);
    leaseUploadsLastSyncedAt.set(key, Date.now());
    return sorted;
  })().catch(() => memoryByEmail.get(key) ?? []);
  leaseUploadsSyncPromise.set(key, promise);
  try {
    return await promise;
  } catch {
    return memoryByEmail.get(key) ?? [];
  } finally {
    leaseUploadsSyncPromise.delete(key);
  }
}

export async function syncUploadedOwnLeaseFromServer(email: string): Promise<UploadedOwnLease | null> {
  const rows = await syncUploadedOwnLeasesFromServer(email);
  return rows[0] ?? null;
}

export function readUploadedOwnLeases(email: string): UploadedOwnLease[] {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return [];
  if (!memoryByEmail.has(key)) void syncUploadedOwnLeasesFromServer(key).catch(() => undefined);
  return memoryByEmail.get(key) ?? [];
}

export function readUploadedOwnLease(email: string): UploadedOwnLease | null {
  return readUploadedOwnLeases(email)[0] ?? null;
}

export function addUploadedOwnLease(email: string, payload: Omit<UploadedOwnLease, "id">): UploadedOwnLease | null {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return null;
  const row: UploadedOwnLease = {
    id: `lease_upload_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...payload,
  };
  const next = sortUploads([...(memoryByEmail.get(key) ?? []), row]);
  memoryByEmail.set(key, next);
  void fetch("/api/portal-resident-lease-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row: { email: key, ...row } }),
  }).catch(() => undefined);
  return row;
}

export function saveUploadedOwnLease(email: string, payload: Omit<UploadedOwnLease, "id"> | UploadedOwnLease): void {
  void addUploadedOwnLease(email, {
    dataUrl: payload.dataUrl,
    fileName: payload.fileName,
    uploadedAt: payload.uploadedAt,
  });
}

export function removeUploadedOwnLease(email: string, uploadId: string): void {
  const key = email.trim().toLowerCase();
  const id = uploadId.trim();
  if (!canUseStorage() || !key || !id) return;
  memoryByEmail.set(key, (memoryByEmail.get(key) ?? []).filter((row) => row.id !== id));
  void fetch("/api/portal-resident-lease-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => undefined);
}

export function clearUploadedOwnLease(email: string): void {
  const rows = readUploadedOwnLeases(email);
  for (const row of rows) removeUploadedOwnLease(email, row.id);
}
