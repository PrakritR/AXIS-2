import { emitAdminUi } from "@/lib/demo-admin-ui";

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
  void fetch("/api/portal-inbox-threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "replace", rows: rows.map((row) => ({ ...row, scope: "admin" })) }),
  }).catch(() => undefined);
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
export async function syncInboxMessagesFromServer(opts?: { force?: boolean }): Promise<InboxMessage[]> {
  if (!isBrowser()) return readAll();
  if (syncedFromServer && !opts?.force) return readAll();
  try {
    const res = await fetch("/api/portal-inbox-threads?scope=admin", { credentials: "include", cache: "no-store" });
    if (!res.ok) return readAll();
    const body = (await res.json()) as { rows?: unknown[] };
    const rows = (Array.isArray(body.rows) ? body.rows : []).filter(looksLikeInboxMessage);
    syncedFromServer = true;
    writeAllLocal(rows);
    return rows;
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

export function moveInboxMessageToTrash(id: string): boolean {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.folder === "trash") return false;
  const from = row.folder;
  const trashedFrom: "inbox" | "sent" = from === "sent" ? "sent" : "inbox";
  const next = [...rows];
  next[idx] = { ...row, folder: "trash", trashedFrom };
  writeAll(next);
  return true;
}

export function restoreInboxMessageFromTrash(id: string): boolean {
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
  writeAll(next);
  return true;
}

/** Remove a message from storage (e.g. from Trash). */
export function permanentlyDeleteInboxMessage(id: string): boolean {
  const rows = readAll();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  writeAllLocal(next);
  void fetch("/api/portal-inbox-threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "deleteIds", ids: [id] }),
  }).catch(() => undefined);
  return true;
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
