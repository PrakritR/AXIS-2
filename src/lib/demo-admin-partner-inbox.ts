import { emitAdminUi } from "@/lib/demo-admin-ui";

const STORAGE_KEY = "axis_admin_inbox_messages_v2";

export type InboxSenderRole = "partner" | "manager" | "resident" | "owner" | "admin";

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
  senderRole: InboxSenderRole;
  thread: InboxThreadReply[];
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): InboxMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const s = seedInbox();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as InboxMessage[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: InboxMessage[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

function seedInbox(): InboxMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-1",
      name: "Jordan Lee",
      email: "jordan@example.com",
      topic: "Partner inquiry",
      body: "We are interested in listing our building on Axis.",
      createdAt: now,
      read: false,
      folder: "inbox",
      senderRole: "partner",
      thread: [],
    },
  ];
}

export function readInboxMessages(): InboxMessage[] {
  return readAll();
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

export function appendInboxMessage(msg: Omit<InboxMessage, "id" | "createdAt" | "read" | "thread"> & { thread?: InboxThreadReply[] }): InboxMessage {
  const row: InboxMessage = {
    ...msg,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    read: msg.folder === "sent",
    thread: msg.thread ?? [],
  };
  const rows = readAll();
  rows.unshift(row);
  writeAll(rows);
  return row;
}

/** Partner / public site contact form */
export function appendPartnerInboxMessage(payload: {
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
    senderRole: "partner",
    thread: [],
  });
}

/** Manager, resident, or owner portal → admin inbox */
export function appendPortalMessageToAdminInbox(payload: {
  role: "manager" | "resident" | "owner";
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
  const next = [...rows];
  next[idx] = { ...next[idx]!, folder: "trash" };
  writeAll(next);
  return true;
}

/** Admin “New message” — appears under Sent. */
export function composeAdminSentMessage(payload: { toEmail: string; toName: string; topic: string; body: string }): InboxMessage {
  return appendInboxMessage({
    name: payload.toName,
    email: payload.toEmail,
    topic: payload.topic,
    body: payload.body,
    folder: "sent",
    senderRole: "admin",
    thread: [],
  });
}

/** @deprecated use readInboxMessages */
export function readPartnerInboxMessages(): InboxMessage[] {
  return readInboxMessages();
}

/** @deprecated */
export function markPartnerInboxMessageRead(id: string): boolean {
  return markInboxMessageRead(id);
}

export function roleAllowsThread(role: InboxSenderRole): boolean {
  return role === "manager" || role === "resident" || role === "owner" || role === "partner";
}

export type PartnerInboxMessage = InboxMessage;
