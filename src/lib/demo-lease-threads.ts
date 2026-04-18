import { emitAdminUi } from "@/lib/demo-admin-ui";

const STORAGE_KEY = "axis_demo_lease_threads_v1";

export type LeaseThreadAuthor = "admin" | "manager" | "owner" | "resident";

export type LeaseThreadMessage = {
  id: string;
  applicationId: string;
  authorRole: LeaseThreadAuthor;
  authorLabel: string;
  body: string;
  createdAt: string;
  editedAt?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): LeaseThreadMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedThread();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      emitAdminUi();
      return seed;
    }
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as LeaseThreadMessage[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: LeaseThreadMessage[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

function seedThread(): LeaseThreadMessage[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-thread-admin",
      applicationId: "app-demo-1",
      authorRole: "admin",
      authorLabel: "Axis Admin",
      body: "Internal: application looks complete. Manager may proceed with lease draft.",
      createdAt: now,
    },
    {
      id: "seed-thread-mgr",
      applicationId: "app-demo-1",
      authorRole: "manager",
      authorLabel: "Property Manager",
      body: "Acknowledged. I will send the lease for signature once the unit walkthrough is scheduled.",
      createdAt: now,
    },
  ];
}

export function readLeaseThreadMessages(applicationId: string): LeaseThreadMessage[] {
  return readAll()
    .filter((m) => m.applicationId === applicationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Residents must not see admin-authored notes.
 * Admin sees the full thread (admin ↔ manager, admin ↔ resident, etc.).
 * Manager and owner see every message on the application thread.
 */
export function listLeaseThreadMessagesForViewer(applicationId: string, viewer: LeaseThreadAuthor): LeaseThreadMessage[] {
  const rows = readLeaseThreadMessages(applicationId);
  if (viewer === "resident") return rows.filter((m) => m.authorRole !== "admin");
  return rows;
}

export function appendLeaseThreadMessage(
  applicationId: string,
  authorRole: LeaseThreadAuthor,
  authorLabel: string,
  body: string,
): LeaseThreadMessage {
  const row: LeaseThreadMessage = {
    id: crypto.randomUUID(),
    applicationId,
    authorRole,
    authorLabel: authorLabel.trim() || authorRole,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  const rows = readAll();
  rows.push(row);
  writeAll(rows);
  return row;
}

/** Only the original author (same portal role) may edit their message body. */
export function editLeaseThreadMessage(
  messageId: string,
  editorRole: LeaseThreadAuthor,
  _editorLabel: string,
  newBody: string,
): boolean {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === messageId);
  if (idx === -1) return false;
  const prev = rows[idx]!;
  if (prev.authorRole !== editorRole) return false;
  const next = [...rows];
  next[idx] = {
    ...prev,
    body: newBody.trim(),
    editedAt: new Date().toISOString(),
  };
  writeAll(next);
  return true;
}
