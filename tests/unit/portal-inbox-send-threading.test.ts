import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { inboxThreadMessages, type PersistedInboxThread } from "@/lib/portal-inbox-storage";

/**
 * Regression: sending several messages to the SAME person must collapse into ONE
 * thread (append), not spawn a fresh thread row per message. Before the send
 * paths reused the person's existing thread, each `deliverPortalInboxMessage`
 * minted `msg_<sender>_<ts>_<rand>` (and `msg_inbox_<ts>_<rand>`), so N sends =
 * N rows on both the sender's Sent view and the recipient's inbox.
 *
 * Driven with an admin sender so the relationship-scope gate short-circuits
 * (`filterRecipientsBySenderScope` returns everything for an admin), keeping the
 * test focused on the thread-collapsing behavior.
 */

type StoredRow = Record<string, unknown> & { id: string };

/** Minimal chainable Supabase stand-in covering the admin send path. */
function makeFakeDb() {
  const tables: Record<string, StoredRow[]> = {
    profiles: [],
    portal_inbox_thread_records: [],
    portal_outbound_mail_records: [],
  };

  function makeQuery(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: [string, unknown][] = [];
    const resolveColumn = (r: StoredRow, col: string): unknown => {
      const jsonPath = col.match(/^(\w+)->>(\w+)$/);
      if (jsonPath) {
        const [, column, key] = jsonPath;
        const nested = (r as Record<string, unknown>)[column!];
        const value = nested && typeof nested === "object" ? (nested as Record<string, unknown>)[key!] : undefined;
        return value == null ? value : String(value);
      }
      return (r as Record<string, unknown>)[col];
    };
    const match = (r: StoredRow) => filters.every(([c, v]) => resolveColumn(r, c) === v);
    const builder = {
      select() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows().find(match) ?? null, error: null });
      },
      upsert(row: StoredRow) {
        const idx = rows().findIndex((r) => r.id === row.id);
        if (idx >= 0) rows()[idx] = { ...rows()[idx], ...row };
        else rows().push({ ...row });
        return Promise.resolve({ error: null });
      },
      then<T>(resolve: (v: { data: StoredRow[]; error: null }) => T) {
        return Promise.resolve({ data: rows().filter(match), error: null }).then(resolve);
      },
    };
    return builder;
  }

  const db = { from: (table: string) => makeQuery(table) } as unknown as SupabaseClient;
  return { db, tables };
}

const SENDER_ID = "mgr_admin_1";
const SENDER_EMAIL = "manager@axis.test";
const RECIPIENT = "founders@axis-seattle-housing.com";

function baseOpts(text: string, subject: string) {
  return {
    senderUserId: SENDER_ID,
    senderEmail: SENDER_EMAIL,
    fromName: "Property manager",
    senderRole: "admin" as const,
    subject,
    text,
    toEmails: [RECIPIENT],
    deliverToPortalInbox: true,
    deliverViaEmail: false,
  };
}

describe("deliverPortalInboxMessage person-thread collapsing", () => {
  it("appends repeated sends to the same person into ONE sent + ONE inbox thread", async () => {
    const { db, tables } = makeFakeDb();

    await deliverPortalInboxMessage(db, baseOpts("first message", "s"));
    await deliverPortalInboxMessage(db, baseOpts("second message", "Re: s"));

    const all = tables.portal_inbox_thread_records!;
    const sent = all.filter((r) => (r.row_data as PersistedInboxThread).folder === "sent");
    const inbox = all.filter((r) => (r.row_data as PersistedInboxThread).folder === "inbox");

    // One thread per person on BOTH sides (was two before the fix).
    expect(sent).toHaveLength(1);
    expect(inbox).toHaveLength(1);

    const sentThread = sent[0]!.row_data as PersistedInboxThread;
    const inboxThread = inbox[0]!.row_data as PersistedInboxThread;

    // Both messages live inside the single thread, in order.
    const sentMessages = inboxThreadMessages(sentThread);
    expect(sentMessages.map((m) => m.body)).toEqual(["first message", "second message"]);
    const inboxMessages = inboxThreadMessages(inboxThread);
    expect(inboxMessages.map((m) => m.body)).toEqual(["first message", "second message"]);

    // Preview reflects the latest message; the recipient's copy stays unread.
    expect(sentThread.preview).toContain("second");
    expect(inboxThread.preview).toContain("second");
    expect(inboxThread.unread).toBe(true);

    // The appended inbound turn on the recipient's copy is marked inbound so the
    // bubble renderer does not treat it as the owner's own reply.
    expect(inboxMessages[1]?.outbound).toBe(false);
  });

  it("keeps separate threads for different people", async () => {
    const { db, tables } = makeFakeDb();

    await deliverPortalInboxMessage(db, baseOpts("hi founders", "s"));
    await deliverPortalInboxMessage(db, {
      ...baseOpts("hi other", "s"),
      toEmails: ["someone-else@example.com"],
    });

    const sent = tables.portal_inbox_thread_records!.filter(
      (r) => (r.row_data as PersistedInboxThread).folder === "sent",
    );
    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((r) => (r.row_data as PersistedInboxThread).email))).toEqual(
      new Set([RECIPIENT, "someone-else@example.com"]),
    );
  });
});
