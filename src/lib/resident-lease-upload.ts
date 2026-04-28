/**
 * Demo: resident-uploaded lease PDF (data URL) scoped by email in localStorage.
 */

function canUseStorage() {
  return typeof window !== "undefined";
}

export type UploadedOwnLease = {
  dataUrl: string;
  fileName: string;
  uploadedAt: string;
};

const memoryByEmail = new Map<string, UploadedOwnLease | null>();

export async function syncUploadedOwnLeaseFromServer(email: string): Promise<UploadedOwnLease | null> {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return null;
  const res = await fetch("/api/portal-resident-lease-uploads", { credentials: "include", cache: "no-store" });
  if (!res.ok) return memoryByEmail.get(key) ?? null;
  const body = (await res.json()) as { rows?: Array<UploadedOwnLease & { email?: string; residentEmail?: string }> };
  const row = (body.rows ?? []).find((candidate) => {
    const rowEmail = String(candidate.email ?? candidate.residentEmail ?? "").trim().toLowerCase();
    return rowEmail === key;
  }) ?? null;
  memoryByEmail.set(key, row);
  return row;
}

export function readUploadedOwnLease(email: string): UploadedOwnLease | null {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return null;
  if (!memoryByEmail.has(key)) void syncUploadedOwnLeaseFromServer(key).catch(() => undefined);
  return memoryByEmail.get(key) ?? null;
}

export function saveUploadedOwnLease(email: string, payload: UploadedOwnLease): void {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return;
  memoryByEmail.set(key, payload);
  void fetch("/api/portal-resident-lease-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row: { id: `lease_upload_${key}`, email: key, ...payload } }),
  }).catch(() => undefined);
}

export function clearUploadedOwnLease(email: string): void {
  const key = email.trim().toLowerCase();
  if (!canUseStorage() || !key) return;
  memoryByEmail.set(key, null);
  void fetch("/api/portal-resident-lease-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id: `lease_upload_${key}` }),
  }).catch(() => undefined);
}
