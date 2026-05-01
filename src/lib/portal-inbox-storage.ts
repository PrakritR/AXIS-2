/** Persist portal inbox threads (demo localStorage) so actions survive navigation and reloads. */

export type PersistedInboxThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
};

export const MANAGER_INBOX_STORAGE_KEY = "axis_portal_inbox_manager_v1";
export const OWNER_INBOX_STORAGE_KEY = "axis_portal_inbox_owner_v1";
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

/** Unopened count for KPIs / badges (matches inbox tab filters). */
export function countUnopenedPersistedInbox(key: string, fallback: PersistedInboxThread[]): number {
  return loadPersistedInbox(key, fallback).filter((t) => t.folder === "inbox" && t.unread).length;
}

export async function syncPersistedInboxFromServer(key: string, opts?: { force?: boolean }): Promise<PersistedInboxThread[]> {
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
    const res = await fetch("/api/portal-inbox-threads", { credentials: "include", cache: "no-store" });
    if (!res.ok) return memoryByKey.get(key) ?? [];
    const body = (await res.json()) as { rows?: PersistedInboxThread[] };
    const rows = (Array.isArray(body.rows) ? body.rows : []).filter(looksLikeThread);
    const existing = memoryByKey.get(key) ?? [];
    memoryByKey.set(key, rows);
    persistInboxToSession(key, rows);
    inboxLastSyncedAtByKey.set(key, Date.now());
    if (inboxRowsChanged(existing, rows)) {
      window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
    }
    return rows;
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
  const rows = memoryByKey.get(key);
  if (rows) return rows.length ? rows : fallback;
  void syncPersistedInboxFromServer(key).catch(() => undefined);
  return fallback;
}

export function persistInbox(key: string, threads: PersistedInboxThread[]): void {
  if (!canUse()) return;
  const existing = memoryByKey.get(key) ?? [];
  if (!inboxRowsChanged(existing, threads)) return;
  memoryByKey.set(key, threads);
  persistInboxToSession(key, threads);
  inboxLastSyncedAtByKey.set(key, Date.now());
  window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
  void fetch("/api/portal-inbox-threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "replace", rows: threads.map((thread) => ({ ...thread, scope: key })) }),
  }).catch(() => undefined);
}

/** Append one thread and emit inbox-changed event for live UI refresh. */
export function appendPersistedInboxThread(key: string, thread: PersistedInboxThread, fallback: PersistedInboxThread[] = []): void {
  const rows = loadPersistedInbox(key, fallback);
  persistInbox(key, [thread, ...rows]);
}
