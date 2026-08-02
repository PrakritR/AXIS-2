import { isDemoModeActive } from "@/lib/demo/demo-session";
/** Persist portal inbox threads (demo localStorage) so actions survive navigation and reloads. */

export type InboxThreadMessage = {
  id: string;
  from: string;
  body: string;
  at: string;
  /**
   * Direction hint from the owner's point of view. Absent on legacy rows and on
   * reply-appended messages (which are always the owner's own outbound replies),
   * where the index heuristic in the bubble builders is correct. Set explicitly
   * when a NEW message is appended to a person-thread so the recipient's inbox
   * copy renders inbound turns as inbound instead of assuming every non-root
   * message is the owner's reply.
   */
  outbound?: boolean;
  /** Optimistic send lifecycle — cleared after server sync. */
  delivery?: "sending" | "sent" | "failed";
};

/**
 * An AI-drafted manager reply awaiting explicit manager approval. Stored ONLY on
 * the manager's own inbox thread row (owner-scoped to the manager), so it is
 * structurally invisible to the resident — residents read their own scope and
 * never this row. Nothing here is ever delivered to a resident until the manager
 * hits Approve & Send, which routes through the normal send path. See
 * `docs/agents/inbox-ai-drafts.md`.
 */
export type InboxAiDraft = {
  text: string;
  /** Only value while stored; approved/discarded drafts are removed, not restatused. */
  status: "pending_approval";
  generatedAt: string;
  model?: string;
};

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
  messages?: InboxThreadMessage[];
  /** Manager-only pending AI reply draft (never present on resident-scope rows). */
  aiDraft?: InboxAiDraft;
};

export const MANAGER_INBOX_STORAGE_KEY = "axis_portal_inbox_manager_v1";
export const RESIDENT_INBOX_STORAGE_KEY = "axis_portal_inbox_resident_v1";
export const VENDOR_INBOX_STORAGE_KEY = "axis_portal_inbox_vendor_v1";

/** Fired after `persistInbox` writes (same tab). `detail.key` is the storage key. */
export const PORTAL_INBOX_CHANGED_EVENT = "axis-portal-inbox-changed";
const memoryByKey = new Map<string, PersistedInboxThread[]>();
const inboxLastSyncedAtByKey = new Map<string, number>();
const inboxSyncPromiseByKey = new Map<string, Promise<PersistedInboxThread[]>>();
const PORTAL_INBOX_SYNC_TTL_MS = 15_000;
let inboxMutationDepth = 0;

/** True while a trash/restore/delete/reply mutation is in flight — blocks stale full replace syncs. */
export function inboxMutationInFlight(): boolean {
  return inboxMutationDepth > 0;
}

export function beginInboxMutation(): void {
  inboxMutationDepth += 1;
}

export function endInboxMutation(): void {
  inboxMutationDepth = Math.max(0, inboxMutationDepth - 1);
}

/** Commit inbox rows to memory/session immediately (before async server writes). */
export function stagePersistedInboxRows(key: string, threads: PersistedInboxThread[]): void {
  commitInboxMemory(key, threads);
}

export async function runInboxMutation<T>(fn: () => Promise<T>): Promise<T> {
  beginInboxMutation();
  try {
    return await fn();
  } finally {
    endInboxMutation();
  }
}

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
  if (isDemoModeActive()) return memoryByKey.get(key) ?? [];
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
    const collapsed =
      key === MANAGER_INBOX_STORAGE_KEY
        ? collapsePersonInboxThreads(merged, { mergeFolders: true })
        : merged;
    memoryByKey.set(key, collapsed);
    persistInboxToSession(key, collapsed);
    inboxLastSyncedAtByKey.set(key, Date.now());
    if (inboxRowsChanged(existing, collapsed)) {
      window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
    }
    return collapsed;
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
    const rows = memoryByKey.get(key) ?? [];
    return key === MANAGER_INBOX_STORAGE_KEY
      ? collapsePersonInboxThreads(rows, { mergeFolders: true })
      : rows;
  }
  void syncPersistedInboxFromServer(key).catch(() => undefined);
  return fallback;
}

/** Permanently delete inbox thread rows from the server. */
export async function deleteInboxThreadIds(ids: string[]): Promise<boolean> {
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!canUse() || clean.length === 0) return true;
  // Demo sandbox is local-only: pretend the server delete succeeded.
  if (isDemoModeActive()) return true;
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
  // Demo sandbox is local-only: pretend the server write succeeded.
  if (isDemoModeActive()) return true;
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
  if (canUse()) {
    window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
  }
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

/** Demo seed: load inbox threads into the local store without server mirror. */
export function seedDemoInbox(key: string, threads: PersistedInboxThread[]): void {
  if (!canUse()) return;
  memoryByKey.set(key, threads);
  persistInboxToSession(key, threads);
  inboxLastSyncedAtByKey.set(key, Date.now());
  window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
}

export function persistInbox(key: string, threads: PersistedInboxThread[]): void {
  if (!canUse() || inboxMutationInFlight()) return;
  const existing = memoryByKey.get(key) ?? [];
  if (!inboxRowsChanged(existing, threads)) return;
  const newIds = new Set(threads.map((t) => t.id));
  const removedIds = existing.map((t) => t.id).filter((id) => !newIds.has(id));
  memoryByKey.set(key, threads);
  persistInboxToSession(key, threads);
  inboxLastSyncedAtByKey.set(key, Date.now());
  window.dispatchEvent(new CustomEvent<{ key: string }>(PORTAL_INBOX_CHANGED_EVENT, { detail: { key } }));
  if (isDemoModeActive()) return;
  void (async () => {
    if (inboxMutationInFlight()) return;
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

/**
 * Newest-first sort key for a conversation row. Thread ids embed the creation
 * epoch (10+ digits); when they don't, fall back to parsing a display/ISO time.
 * One implementation for every portal inbox — manager, unified, vendor.
 */
export function inboxThreadSortMs(id: string, fallbackTime?: string | null): number {
  const match = String(id ?? "").match(/(\d{10,})/);
  if (match) return parseInt(match[1]!, 10);
  const parsed = Date.parse(fallbackTime ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Stable resident/counterparty key for collapsing duplicate person-threads. */
export function inboxThreadCounterpartyEmail(
  thread: Pick<PersistedInboxThread, "email" | "from">,
): string {
  const email = String(thread.email ?? "").trim().toLowerCase();
  if (email.includes("@")) return email;
  const from = String(thread.from ?? "").trim().toLowerCase();
  if (from.includes("@")) return from;
  return email;
}

export function inboxThreadMessages(thread: PersistedInboxThread): InboxThreadMessage[] {
  const root: InboxThreadMessage = {
    id: `${thread.id}-root`,
    from: thread.from,
    body: thread.body,
    at: thread.time,
  };
  return [root, ...(thread.messages ?? [])];
}

export function appendReplyToInboxThread(
  thread: PersistedInboxThread,
  reply: InboxThreadMessage,
): PersistedInboxThread {
  return {
    ...thread,
    messages: [...(thread.messages ?? []), reply],
    preview: reply.body.slice(0, 100).replace(/\n/g, " "),
    unread: false,
  };
}

/**
 * Collapse duplicate person-threads into one row for display. Payment reminders
 * and manual sends used to mint a fresh thread id per message; this merges their
 * message history without rewriting storage.
 */
export function collapsePersonInboxThreads(
  threads: PersistedInboxThread[],
  opts?: { mergeFolders?: boolean },
): PersistedInboxThread[] {
  const mergeFolders = opts?.mergeFolders === true;
  const solo: PersistedInboxThread[] = [];
  const groups = new Map<string, PersistedInboxThread[]>();

  for (const thread of threads) {
    const counterparty = inboxThreadCounterpartyEmail(thread);
    if (!counterparty.includes("@") || thread.folder === "trash") {
      solo.push(thread);
      continue;
    }
    const key = mergeFolders ? counterparty : `${thread.folder}:${counterparty}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(thread);
    groups.set(key, bucket);
  }

  const merged: PersistedInboxThread[] = [...solo];
  for (const group of groups.values()) {
    if (group.length <= 1) {
      merged.push(group[0]!);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => inboxThreadSortMs(a.id, a.time) - inboxThreadSortMs(b.id, b.time),
    );
    const canonical = sorted[sorted.length - 1]!;
    const allMessages: InboxThreadMessage[] = [];
    for (const th of sorted) {
      allMessages.push(...inboxThreadMessages(th));
    }
    const seenIds = new Set<string>();
    const ordered = allMessages.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    const first = ordered[0];
    if (!first) {
      merged.push(canonical);
      continue;
    }
    const last = ordered[ordered.length - 1]!;
    merged.push({
      ...canonical,
      body: first.body,
      from: first.from,
      time: canonical.time,
      preview: last.body.slice(0, 100).replace(/\n/g, " "),
      messages: ordered.slice(1),
      unread: group.some((t) => t.unread),
    });
  }
  return merged;
}

/** Resolve the collapsed thread row for the open conversation (merged message history). */
export function resolveCollapsedInboxThread(
  expandedId: string | null,
  collapsed: PersistedInboxThread[],
  raw: PersistedInboxThread[],
): PersistedInboxThread | null {
  if (!expandedId) return null;
  const direct = collapsed.find((t) => t.id === expandedId);
  if (direct) return direct;
  const legacy = raw.find((t) => t.id === expandedId);
  if (!legacy) return null;
  const counterparty = inboxThreadCounterpartyEmail(legacy);
  if (!counterparty.includes("@")) return legacy;
  return (
    collapsed.find((t) => inboxThreadCounterpartyEmail(t) === counterparty) ?? legacy
  );
}
