import { emitAdminUi } from "@/lib/demo-admin-ui";
import { deleteInboxThreadIds } from "@/lib/portal-inbox-storage";

let inboxMessages: InboxMessage[] = [];

export type InboxSenderRole = "partner" | "manager" | "resident" | "admin";

export type InboxThreadReply = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
};

export type InboxMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** inbox = normal mail; sent = admin composed; trash = soft-deleted */
  folder: "inbox" | "sent" | "trash";
  /** When in trash, restore returns here */
  trashedFrom?: "inbox" | "sent";
  senderRole: InboxSenderRole;
  thread: InboxThreadReply[];
  /** Sent-folder only: who the admin addressed */
  composeAudience?:
    | "manager"
    | "resident"
    | "all"
    | "all_managers"
    | "all_residents"
    | "multi";
  composeRecipientLabel?: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function readAll(): InboxMessage[] {
  if (!isBrowser()) return [];
  return inboxMessages;
}

function writeAllLocal(rows: InboxMessage[]) {
  if (!isBrowser()) return;
  inboxMessages = rows;
  emitAdminUi();
}

function writeAll(rows: InboxMessage[]) {
  writeAllLocal(rows);
  void persistInboxMessagesAwait(rows).catch(() => undefined);
}

async function persistInboxMessagesAwait(rows: InboxMessage[]): Promise<boolean> {
  if (!isBrowser()) return false;
  writeAllLocal(rows);
  try {
    const res = await fetch("/api/portal-inbox-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "replace", rows: rows.map((row) => ({ ...row, scope: "admin" })) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function mergeAdminInboxWithLocalTrash(
  serverRows: InboxMessage[],
  localRows: InboxMessage[],
  excludeIds?: Set<string>,
): InboxMessage[] {
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const serverIds = new Set(serverRows.map((row) => row.id));
  const merged = serverRows
    .filter((row) => !excludeIds?.has(row.id))
    .map((serverRow) => {
      const localRow = localById.get(serverRow.id);
      if (localRow?.folder === "trash" && serverRow.folder !== "trash") {
        return { ...serverRow, folder: "trash" as const, trashedFrom: localRow.trashedFrom };
      }
      if (localRow && localRow.folder !== "trash" && serverRow.folder === "trash") {
        return { ...serverRow, folder: localRow.folder, trashedFrom: undefined, read: localRow.read };
      }
      return serverRow;
    });
  for (const localRow of localRows) {
    if (excludeIds?.has(localRow.id) || serverIds.has(localRow.id)) continue;
    merged.push(localRow);
  }
  return merged;
}

export function readInboxMessages(): InboxMessage[] {
  return readAll();
}

function looksLikeInboxMessage(row: unknown): row is InboxMessage {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.folder === "string" && typeof r.senderRole === "string";
}

let syncedFromServer = false;

/** Hydrate the in-memory admin inbox from the server (admin inbox is otherwise lost on every fresh page load). */
export async function syncInboxMessagesFromServer(opts?: { force?: boolean; excludeIds?: Set<string> }): Promise<InboxMessage[]> {
  if (!isBrowser()) return readAll();
  if (syncedFromServer && !opts?.force) return readAll();
  try {
    const res = await fetch("/api/portal-inbox-threads?scope=admin", { credentials: "include", cache: "no-store" });
    if (!res.ok) return readAll();
    const body = (await res.json()) as { rows?: unknown[] };
    const rows = (Array.isArray(body.rows) ? body.rows : []).filter(looksLikeInboxMessage);
    const existing = readAll();
    const merged = mergeAdminInboxWithLocalTrash(rows, existing, opts?.excludeIds);
    syncedFromServer = true;
    writeAllLocal(merged);
    return merged;
  } catch {
    return readAll();
  }
}

export function markInboxMessageRead(id: string): boolean {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = [...rows];
  next[idx] = { ...next[idx]!, read: true };
  writeAll(next);
  return true;
}

export function appendInboxMessage(
  msg: Omit<InboxMessage, "id" | "createdAt" | "read" | "thread"> & { thread?: InboxThreadReply[] },
): InboxMessage {
  const row: InboxMessage = {
    ...msg,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    read: msg.folder === "sent",
    thread: msg.thread ?? [],
    trashedFrom: msg.trashedFrom,
    composeAudience: msg.composeAudience,
    composeRecipientLabel: msg.composeRecipientLabel,
  };
  const rows = readAll();
  rows.unshift(row);
  writeAll(rows);
  return row;
}

/** Partner / public site contact form */
export function appendPartnerInboxMessage(payload: { name: string; email: string; topic: string; body: string }): InboxMessage {
  return appendInboxMessage({
    name: payload.name,
    email: payload.email,
    topic: payload.topic,
    body: payload.body,
    folder: "inbox",
    senderRole: "partner",
    thread: [],
  });
}

/** Property or resident portal → admin inbox */
export function appendPortalMessageToAdminInbox(payload: {
  role: "manager" | "resident";
  name: string;
  email: string;
  topic: string;
  body: string;
}): InboxMessage {
  return appendInboxMessage({
    name: payload.name,
    email: payload.email,
    topic: payload.topic,
    body: payload.body,
    folder: "inbox",
    senderRole: payload.role,
    thread: [],
  });
}

export function appendThreadReply(messageId: string, authorLabel: string, body: string): boolean {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === messageId);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.folder === "trash") return false;
  if (!roleAllowsThread(row.senderRole)) return false;
  const reply: InboxThreadReply = {
    id: crypto.randomUUID(),
    authorLabel,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  const next = [...rows];
  next[idx] = { ...row, thread: [...row.thread, reply] };
  writeAll(next);
  return true;
}

export async function moveInboxMessageToTrash(id: string): Promise<boolean> {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.folder === "trash") return false;
  const from = row.folder;
  const trashedFrom: "inbox" | "sent" = from === "sent" ? "sent" : "inbox";
  const next = [...rows];
  next[idx] = { ...row, folder: "trash", trashedFrom };
  return persistInboxMessagesAwait(next);
}

export async function restoreInboxMessageFromTrash(id: string): Promise<boolean> {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.folder !== "trash") return false;
  const dest = row.trashedFrom ?? "inbox";
  const next = [...rows];
  if (dest === "sent") {
    next[idx] = { ...row, folder: "sent", trashedFrom: undefined, read: true };
  } else {
    next[idx] = { ...row, folder: "inbox", trashedFrom: undefined, read: false };
  }
  return persistInboxMessagesAwait(next);
}

/** Remove a message from storage (e.g. from Trash). */
export async function permanentlyDeleteInboxMessage(id: string): Promise<boolean> {
  const rows = readAll();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  const deleted = await deleteInboxThreadIds([id]);
  if (!deleted) return false;
  return persistInboxMessagesAwait(next);
}

/** Permanently delete all messages in the admin trash folder. */
export async function emptyAdminInboxTrash(): Promise<boolean> {
  const rows = readAll();
  const trashIds = rows.filter((r) => r.folder === "trash").map((r) => r.id).filter(Boolean);
  if (trashIds.length === 0) return true;
  const deleted = await deleteInboxThreadIds(trashIds);
  if (!deleted) return false;
  const next = rows.filter((r) => r.folder !== "trash");
  return persistInboxMessagesAwait(next);
}

export type AdminComposeSendMode =
  | "all_portal"
  | "all_managers"
  | "all_residents"
  | "pick_managers"
  | "pick_residents";

/** @deprecated use readInboxMessages */
export function readPartnerInboxMessages(): InboxMessage[] {
  return readInboxMessages();
}

/** @deprecated use markInboxMessageRead */
export function markPartnerInboxMessageRead(id: string): boolean {
  return markInboxMessageRead(id);
}

export function roleAllowsThread(role: InboxSenderRole): boolean {
  return role === "manager" || role === "resident" || role === "partner" || role === "admin";
}

export type PartnerInboxMessage = InboxMessage;
