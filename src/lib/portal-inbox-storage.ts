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

/** Fired after `persistInbox` writes (same tab). `detail.key` is the storage key. */
export const PORTAL_INBOX_CHANGED_EVENT = "axis-portal-inbox-changed";

function canUse(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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

/** Load inbox JSON or return fallback when missing / invalid. */
export function loadPersistedInbox(key: string, fallback: PersistedInboxThread[]): PersistedInboxThread[] {
  if (!canUse()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return fallback;
    const threads = v.filter(looksLikeThread);
    return threads.length ? threads : fallback;
  } catch {
    return fallback;
  }
}

export function persistInbox(key: string, threads: PersistedInboxThread[]): void {
  if (!canUse()) return;
  try {
    localStorage.setItem(key, JSON.stringify(threads));
    window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
  } catch {
    /* quota */
  }
}
