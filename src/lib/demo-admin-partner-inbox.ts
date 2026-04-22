import { emitAdminUi } from "@/lib/demo-admin-ui";

const STORAGE_KEY = "axis_admin_inbox_messages_v2";
/** Pre–v2 partner-only inbox (migrated once into STORAGE_KEY). */
const LEGACY_PARTNER_KEY = "axis_admin_partner_inbox_threads_v1";

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
  /** When in trash, restore returns here */
  trashedFrom?: "inbox" | "sent";
  senderRole: InboxSenderRole;
  thread: InboxThreadReply[];
  /** Sent-folder only: who the admin addressed */
  composeAudience?:
    | "manager"
    | "resident"
    | "owner"
    | "all"
    | "all_managers"
    | "all_residents"
    | "all_owners"
    | "multi";
  composeRecipientLabel?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function migrateLegacyRow(m: Record<string, unknown>): InboxMessage {
  return {
    id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
    name: String(m.name ?? ""),
    email: String(m.email ?? ""),
    topic: String(m.topic ?? ""),
    body: String(m.body ?? ""),
    createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString(),
    read: Boolean(m.read),
    folder: "inbox",
    senderRole: "partner",
    thread: [],
    trashedFrom: undefined,
    composeAudience: undefined,
    composeRecipientLabel: undefined,
  };
}

function readAll(): InboxMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const legacyRaw = window.localStorage.getItem(LEGACY_PARTNER_KEY);
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw) as unknown;
          if (Array.isArray(legacy)) {
            const migrated = legacy.map((row) => migrateLegacyRow(row as Record<string, unknown>));
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            emitAdminUi();
            return migrated;
          }
        } catch {
          /* fall through to seed */
        }
      }
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
  writeAll(next);
  return true;
}

export type AdminComposeSendMode =
  | "all_portal"
  | "all_managers"
  | "all_residents"
  | "all_owners"
  | "pick_managers"
  | "pick_residents"
  | "pick_owners";

/** @deprecated use readInboxMessages */
export function readPartnerInboxMessages(): InboxMessage[] {
  return readInboxMessages();
}

/** @deprecated use markInboxMessageRead */
export function markPartnerInboxMessageRead(id: string): boolean {
  return markInboxMessageRead(id);
}

export function roleAllowsThread(role: InboxSenderRole): boolean {
  return (
    role === "manager" ||
    role === "resident" ||
    role === "owner" ||
    role === "partner" ||
    role === "admin"
  );
}

export type PartnerInboxMessage = InboxMessage;
