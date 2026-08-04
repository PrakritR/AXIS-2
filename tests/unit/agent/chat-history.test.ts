import { describe, expect, it } from "vitest";

import { handleAgentChatHistoryRequest } from "@/lib/agent/chat-history-route";
import {
  AGENT_CHAT_HISTORY_PAGE_SIZE,
  listAgentChatThreads,
  loadAgentChatTranscript,
} from "@/lib/agent/chat-history";
import { appendAgentMessages, createPortalChatSession, ensureAgentSession } from "@/lib/agent/sessions";

type Row = Record<string, unknown> & { id: string };
type TableName = "agent_sessions" | "agent_messages" | "agent_pending_actions";
type Filter = { op: "eq" | "gt" | "lt"; column: string; value: unknown };

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const SESSION_A = "10000000-0000-4000-8000-000000000001";
const SESSION_B = "10000000-0000-4000-8000-000000000002";

/** Small in-memory chain that records the same equality/range behavior used by the archive. */
function makeDb(seed: Partial<Record<TableName, Row[]>>, options: { withoutSessionTitle?: boolean } = {}) {
  const tables: Record<TableName, Row[]> = {
    agent_sessions: [...(seed.agent_sessions ?? [])],
    agent_messages: [...(seed.agent_messages ?? [])],
    agent_pending_actions: [...(seed.agent_pending_actions ?? [])],
  };
  let sequence = 0;

  const matches = (row: Row, filters: Filter[]) =>
    filters.every(({ op, column, value }) => {
      if (op === "eq") return row[column] === value;
      return op === "gt" ? String(row[column] ?? "") > String(value) : String(row[column] ?? "") < String(value);
    });

  return {
    tables,
    from(table: TableName) {
      const filters: Filter[] = [];
      let operation: "select" | "insert" | "update" = "select";
      let insertValues: Row[] = [];
      let updateValues: Record<string, unknown> = {};
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limitTo: number | null = null;
      let selectedColumns = "";
      const chain: Record<string, unknown> = {};

      const materialize = () => {
        const titleMissing =
          options.withoutSessionTitle &&
          table === "agent_sessions" &&
          (selectedColumns.split(",").map((column) => column.trim()).includes("title") ||
            (operation === "insert" && insertValues.some((value) => "title" in value)));
        if (titleMissing) {
          return {
            data: null,
            error: { code: "PGRST204", message: "Could not find the 'title' column of 'agent_sessions'" },
          };
        }
        const rows = tables[table];
        let result = rows.filter((row) => matches(row, filters));
        if (operation === "update") {
          result.forEach((row) => Object.assign(row, updateValues));
        }
        if (operation === "insert") {
          const inserted = insertValues.map((row) => ({ ...row, id: row.id || `created-${++sequence}` }));
          rows.push(...inserted);
          result = inserted;
        }
        if (orderBy) {
          result = [...result].sort((a, b) => {
            const compared = String(a[orderBy!.column] ?? "").localeCompare(String(b[orderBy!.column] ?? ""));
            return orderBy!.ascending ? compared : -compared;
          });
        }
        if (limitTo !== null) result = result.slice(0, limitTo);
        return { data: result.map((row) => ({ ...row })), error: null };
      };

      chain.select = (columns = "") => {
        selectedColumns = columns;
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        filters.push({ op: "eq", column, value });
        return chain;
      };
      chain.gt = (column: string, value: unknown) => {
        filters.push({ op: "gt", column, value });
        return chain;
      };
      chain.lt = (column: string, value: unknown) => {
        filters.push({ op: "lt", column, value });
        return chain;
      };
      chain.order = (column: string, options: { ascending?: boolean } = {}) => {
        orderBy = { column, ascending: options.ascending !== false };
        return chain;
      };
      chain.limit = (value: number) => {
        limitTo = value;
        return chain;
      };
      chain.update = (value: Record<string, unknown>) => {
        operation = "update";
        updateValues = value;
        return chain;
      };
      chain.insert = (value: Row | Row[]) => {
        operation = "insert";
        insertValues = Array.isArray(value) ? value : [value];
        return chain;
      };
      chain.maybeSingle = async () => {
        const { data, error } = materialize();
        return { data: Array.isArray(data) ? data[0] ?? null : null, error };
      };
      chain.single = async () => {
        const { data, error } = materialize();
        return { data: Array.isArray(data) ? data[0] ?? null : null, error };
      };
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(materialize()).then(resolve, reject);
      return chain;
    },
    // The application service client is intentionally untyped at this seam.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function portalSession(id: string, updatedAt: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    user_id: USER_A,
    landlord_id: USER_A,
    portal: "manager",
    kind: "portal_chat",
    title: `Thread ${id.slice(-2)}`,
    updated_at: updatedAt,
    ...overrides,
  };
}

describe("portal chat archive", () => {
  it("paginates newest portal_chat sessions and excludes other users, portals, and agent kinds", async () => {
    const newest = Array.from({ length: AGENT_CHAT_HISTORY_PAGE_SIZE + 1 }, (_, index) =>
      portalSession(
        `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        new Date(Date.UTC(2026, 7, 4, 12, 0, 0) - index * 1_000).toISOString(),
      ),
    );
    const db = makeDb({
      agent_sessions: [
        ...newest,
        portalSession(SESSION_B, "2026-08-04T12:00:01.000Z", { user_id: USER_B }),
        portalSession("30000000-0000-4000-8000-000000000003", "2026-08-04T12:00:02.000Z", { portal: "resident" }),
        portalSession("30000000-0000-4000-8000-000000000004", "2026-08-04T12:00:03.000Z", { kind: "leasing_sms" }),
      ],
    });

    const first = await listAgentChatThreads({ userId: USER_A, db }, "manager");
    expect(first.threads).toHaveLength(AGENT_CHAT_HISTORY_PAGE_SIZE);
    expect(first.threads[0]?.id).toBe(newest[0]!.id);
    expect(first.nextCursor).toBe(newest.at(-2)?.updated_at);

    const second = await listAgentChatThreads({ userId: USER_A, db }, "manager", first.nextCursor);
    expect(second.threads.map((thread) => thread.id)).toEqual([newest.at(-1)!.id]);
    expect(second.nextCursor).toBeNull();
  });

  it("loads only an owned portal transcript and rehydrates a still-valid confirmation preview", async () => {
    const db = makeDb({
      agent_sessions: [portalSession(SESSION_A, "2026-08-04T12:00:00.000Z")],
      agent_messages: [
        { id: "m1", session_id: SESSION_A, role: "user", content: "Send a reminder", created_at: "2026-08-04T12:00:01.000Z" },
        { id: "m2", session_id: SESSION_A, role: "assistant", content: "I can draft that.", created_at: "2026-08-04T12:00:02.000Z" },
        { id: "m3", session_id: SESSION_A, role: "tool", content: "never shown", created_at: "2026-08-04T12:00:03.000Z" },
      ],
      agent_pending_actions: [
        {
          id: "pending-1",
          session_id: SESSION_A,
          user_id: USER_A,
          portal: "manager",
          status: "proposed",
          expires_at: "2099-01-01T00:00:00.000Z",
          preview: { kind: "send_rent_reminder", title: "Send reminder", confirmLabel: "Send", fields: [] },
          input: { private: "must never leave the server" },
          created_at: "2026-08-04T12:00:03.000Z",
        },
      ],
    });

    const transcript = await loadAgentChatTranscript({ userId: USER_A, db }, "manager", SESSION_A);
    expect(transcript?.messages).toEqual([
      { role: "user", content: "Send a reminder" },
      { role: "assistant", content: "I can draft that." },
    ]);
    expect(transcript?.pendingAction).toEqual({
      id: "pending-1",
      preview: { kind: "send_rent_reminder", title: "Send reminder", confirmLabel: "Send", fields: [] },
    });
    expect(transcript?.pendingAction).not.toHaveProperty("input");

    expect(await loadAgentChatTranscript({ userId: USER_B, db }, "manager", SESSION_A)).toBeNull();
    expect(await loadAgentChatTranscript({ userId: USER_A, db }, "resident", SESSION_A)).toBeNull();
  });

  it("returns a generic not-found response for malformed and foreign conversation ids", async () => {
    const db = makeDb({ agent_sessions: [portalSession(SESSION_A, "2026-08-04T12:00:00.000Z")] });
    const actor = { userId: USER_B, db };

    const malformed = await handleAgentChatHistoryRequest(
      new Request("https://example.test/api/agent/chat?sessionId=not-a-uuid"),
      actor,
      "manager",
    );
    expect(malformed.status).toBe(400);

    const foreign = await handleAgentChatHistoryRequest(
      new Request(`https://example.test/api/agent/chat?sessionId=${SESSION_A}`),
      actor,
      "manager",
    );
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).error).toBe("Conversation not found.");
  });

  it("reuses a matching server session but replaces a foreign id with a fresh session", async () => {
    const db = makeDb({ agent_sessions: [portalSession(SESSION_A, "2026-08-04T12:00:00.000Z")] });
    const actor = { userId: USER_A, landlordId: USER_A, db };

    expect(
      await ensureAgentSession(actor, "manager", {
        sessionId: SESSION_A,
        kind: "portal_chat",
        title: "This title must not create a duplicate",
      }),
    ).toBe(SESSION_A);
    expect(db.tables.agent_sessions).toHaveLength(1);

    const fresh = await ensureAgentSession(actor, "manager", {
      sessionId: SESSION_B,
      kind: "portal_chat",
      title: "New thread title",
    });
    expect(fresh).not.toBe(SESSION_B);
    expect(db.tables.agent_sessions).toHaveLength(2);
    expect(db.tables.agent_sessions[1]).toMatchObject({
      user_id: USER_A,
      portal: "manager",
      kind: "portal_chat",
      title: "New thread title",
    });
  });

  it("persists a completed turn before a transcript can be reopened", async () => {
    const db = makeDb({ agent_sessions: [portalSession(SESSION_A, "2026-08-04T12:00:00.000Z")] });
    const actor = { userId: USER_A, landlordId: USER_A, db };

    await appendAgentMessages(
      actor,
      "manager",
      SESSION_A,
      [
        { role: "user", content: "Can you send a reminder?" },
        { role: "assistant", content: "I can draft one for your approval." },
      ],
      { kind: "portal_chat" },
    );

    const reopened = await loadAgentChatTranscript(actor, "manager", SESSION_A);
    expect(reopened?.messages).toEqual([
      { role: "user", content: "Can you send a reminder?" },
      { role: "assistant", content: "I can draft one for your approval." },
    ]);
  });

  it("creates and lists a blank thread even while an additive title migration is pending", async () => {
    const db = makeDb({}, { withoutSessionTitle: true });
    const actor = { userId: USER_A, landlordId: USER_A, db };

    const sessionId = await createPortalChatSession(actor, "manager");
    expect(sessionId).toBe("created-1");

    const archive = await listAgentChatThreads(actor, "manager");
    expect(archive.error).toBeUndefined();
    expect(archive.threads).toEqual([
      expect.objectContaining({ id: sessionId, title: "New conversation" }),
    ]);
  });
});
