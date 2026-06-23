/** Persist portal inbox threads (demo localStorage) so actions survive navigation and reloads. */

export type PersistedInboxThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  previousFolder?: "inbox" | "sent";
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
};

export const MANAGER_INBOX_STORAGE_KEY = "axis_portal_inbox_manager_v1";
export const RESIDENT_INBOX_STORAGE_KEY = "axis_portal_inbox_resident_v1";

/** Fired after `persistInbox` writes (same tab). `detail.key` is the storage key. */
export const PORTAL_INBOX_CHANGED_EVENT = "axis-portal-inbox-changed";
const memoryByKey = new Map<string, PersistedInboxThread[]>();
const inboxLastSyncedAtByKey = new Map<string, number>();
const inboxSyncPromiseByKey = new Map<string, Promise<PersistedInboxThread[]>>();
const PORTAL_INBOX_SYNC_TTL_MS = 15_000;

function inboxRowsChanged(a: PersistedInboxThread[], b: PersistedInboxThread[]) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function canUse(): boolean {
  return typeof window !== "undefined";
}

function sessionKeyForInbox(key: string) {
  return `axis:portal-inbox:${key}`;
}

function hydrateInboxFromSession(key: string) {
  if (!canUse() || memoryByKey.has(key)) return;
  try {
    const raw = window.sessionStorage.getItem(sessionKeyForInbox(key));
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedInboxThread[];
    if (!Array.isArray(parsed)) return;
    memoryByKey.set(key, parsed.filter(looksLikeThread));
  } catch {
    /* ignore */
  }
}

function persistInboxToSession(key: string, rows: PersistedInboxThread[]) {
  if (!canUse()) return;
  try {
    window.sessionStorage.setItem(sessionKeyForInbox(key), JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function looksLikeThread(row: unknown): row is PersistedInboxThread {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.folder === "string";
}

/** Prefer local trash/restore state when server sync is stale (e.g. tab remount before persist completes). */
export function mergeInboxRowsWithLocalTrash(
  serverRows: PersistedInboxThread[],
  localRows: PersistedInboxThread[],
  opts?: { excludeIds?: Set<string> },
): PersistedInboxThread[] {
  const excludeIds = opts?.excludeIds ?? new Set<string>();
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const serverIds = new Set(serverRows.map((row) => row.id));
  const merged = serverRows
    .filter((row) => !excludeIds.has(row.id))
    .map((serverRow) => {
      const localRow = localById.get(serverRow.id);
      if (!localRow) return serverRow;
      if (localRow.folder === "trash" && serverRow.folder !== "trash") {
        return {
          ...serverRow,
          folder: "trash" as const,
          previousFolder: localRow.previousFolder,
          unread: false,
        };
      }
      if (localRow.folder !== "trash" && serverRow.folder === "trash") {
        return { ...serverRow, folder: localRow.folder, previousFolder: undefined, unread: localRow.unread };
      }
      return serverRow;
    });
  for (const localRow of localRows) {
    if (excludeIds.has(localRow.id) || serverIds.has(localRow.id)) continue;
    merged.push(localRow);
  }
  return merged;
}

/** Unopened count for KPIs / badges (matches inbox tab filters). */
export function countUnopenedPersistedInbox(key: string, fallback: PersistedInboxThread[]): number {
  return loadPersistedInbox(key, fallback).filter((t) => t.folder === "inbox" && t.unread).length;
}

export async function syncPersistedInboxFromServer(
  key: string,
  opts?: { force?: boolean; excludeIds?: Set<string> },
): Promise<PersistedInboxThread[]> {
  if (!canUse()) return [];
  hydrateInboxFromSession(key);
  const force = opts?.force === true;
  const inflight = inboxSyncPromiseByKey.get(key);
  if (!force && inflight) return inflight;
  const lastSyncedAt = inboxLastSyncedAtByKey.get(key) ?? 0;
  if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < PORTAL_INBOX_SYNC_TTL_MS) {
    return memoryByKey.get(key) ?? [];
  }
  const promise = (async () => {
    const res = await fetch(`/api/portal-inbox-threads?scope=${encodeURIComponent(key)}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) return memoryByKey.get(key) ?? [];
    const body = (await res.json()) as { rows?: PersistedInboxThread[] };
    const rows = (Array.isArray(body.rows) ? body.rows : []).filter(looksLikeThread);
    const existing = memoryByKey.get(key) ?? [];
    const merged = mergeInboxRowsWithLocalTrash(rows, existing, { excludeIds: opts?.excludeIds });
    memoryByKey.set(key, merged);
    persistInboxToSession(key, merged);
    inboxLastSyncedAtByKey.set(key, Date.now());
    if (inboxRowsChanged(existing, merged)) {
      window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
    }
    return merged;
  })();
  inboxSyncPromiseByKey.set(key, promise);
  try {
    return await promise;
  } finally {
    inboxSyncPromiseByKey.delete(key);
  }
}

/** Load inbox JSON or return fallback when missing / invalid. */
export function loadPersistedInbox(key: string, fallback: PersistedInboxThread[]): PersistedInboxThread[] {
  if (!canUse()) return fallback;
  hydrateInboxFromSession(key);
  if (memoryByKey.has(key)) {
    return memoryByKey.get(key) ?? [];
  }
  void syncPersistedInboxFromServer(key).catch(() => undefined);
  return fallback;
}

/** Permanently delete inbox thread rows from the server. */
export async function deleteInboxThreadIds(ids: string[]): Promise<boolean> {
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!canUse() || clean.length === 0) return true;
  try {
    const res = await fetch("/api/portal-inbox-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "deleteIds", ids: clean }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && data.ok !== false;
  } catch {
    return false;
  }
}

/** Clear cached inbox rows so the next sync always refetches from the server. */
export function invalidatePersistedInboxCache(key: string): void {
  if (!canUse()) return;
  inboxLastSyncedAtByKey.set(key, 0);
}

async function postInboxRows(
  action: "replace" | "upsert",
  key: string,
  rows: PersistedInboxThread[],
): Promise<boolean> {
  try {
    const res = await fetch("/api/portal-inbox-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        action === "replace"
          ? { action, rows: rows.map((thread) => ({ ...thread, scope: key })) }
          : { action, row: { ...rows[0]!, scope: key } },
      ),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return data.ok !== false;
  } catch {
    return false;
  }
}

function commitInboxMemory(key: string, threads: PersistedInboxThread[]): void {
  memoryByKey.set(key, threads);
  persistInboxToSession(key, threads);
  inboxLastSyncedAtByKey.set(key, Date.now());
  window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
}

/** Upsert one or more changed rows without deleting threads missing from the payload. */
export async function upsertPersistedInboxRows(
  key: string,
  changedRows: PersistedInboxThread[],
  allRows: PersistedInboxThread[],
): Promise<boolean> {
  if (!canUse() || changedRows.length === 0) return false;
  commitInboxMemory(key, allRows);
  for (const row of changedRows) {
    const ok = await postInboxRows("upsert", key, [row]);
    if (!ok) return false;
  }
  return true;
}

export async function persistInboxAwait(key: string, threads: PersistedInboxThread[]): Promise<boolean> {
  if (!canUse()) return false;
  const existing = memoryByKey.get(key) ?? [];
  const newIds = new Set(threads.map((t) => t.id));
  const removedIds = existing.map((t) => t.id).filter((id) => !newIds.has(id));
  if (removedIds.length > 0) {
    const deleted = await deleteInboxThreadIds(removedIds);
    if (!deleted) return false;
  }
  commitInboxMemory(key, threads);
  return postInboxRows("replace", key, threads);
}

export function persistInbox(key: string, threads: PersistedInboxThread[]): void {
  if (!canUse()) return;
  const existing = memoryByKey.get(key) ?? [];
  if (!inboxRowsChanged(existing, threads)) return;
  const newIds = new Set(threads.map((t) => t.id));
  const removedIds = existing.map((t) => t.id).filter((id) => !newIds.has(id));
  memoryByKey.set(key, threads);
  persistInboxToSession(key, threads);
  inboxLastSyncedAtByKey.set(key, Date.now());
  window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
  void (async () => {
    if (removedIds.length > 0) {
      const deleted = await deleteInboxThreadIds(removedIds);
      if (!deleted) return;
    }
    await fetch("/api/portal-inbox-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "replace", rows: threads.map((thread) => ({ ...thread, scope: key })) }),
    }).catch(() => undefined);
  })();
}

/** Append one thread and emit inbox-changed event for live UI refresh. */
export function appendPersistedInboxThread(key: string, thread: PersistedInboxThread, fallback: PersistedInboxThread[] = []): void {
  const rows = loadPersistedInbox(key, fallback);
  persistInbox(key, [thread, ...rows]);
}
