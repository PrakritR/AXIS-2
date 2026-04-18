import { emitAdminUi } from "@/lib/demo-admin-ui";

const KEY = "axis_admin_partner_inbox_threads_v1";

export type PartnerInboxMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  body: string;
  read: boolean;
  createdAt: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

export function readPartnerInboxMessages(): PartnerInboxMessage[] {
  const rows = readJson<PartnerInboxMessage[] | null>(KEY, null);
  return Array.isArray(rows) ? rows : [];
}

export function appendPartnerInboxMessage(payload: Omit<PartnerInboxMessage, "id" | "read" | "createdAt">) {
  const rows = readPartnerInboxMessages();
  const row: PartnerInboxMessage = {
    ...payload,
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(row);
  writeJson(KEY, rows);
}

export function markPartnerInboxMessageRead(id: string): boolean {
  const rows = readPartnerInboxMessages();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = [...rows];
  next[idx] = { ...next[idx]!, read: true };
  writeJson(KEY, next);
  return true;
}
