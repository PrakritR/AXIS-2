// Two conversation-identity invariants that, when broken, silently destroy or
// hide a manager's message history.
//
//  1. GROUPING — a stored row stamped `resident` must fold into the named
//     resident's thread. The read path deliberately refuses to fold a
//     `prospect` thread into a directory resident (that split is the feature),
//     so mis-stamping a resident's history as `prospect` makes it vanish from
//     the named thread and resurface as an unnamed phone number. That is the
//     user-visible consequence the backfill ordering guards against — see
//     `sms-conversation-identity-backfill.test.ts`.
//  2. DELETE SCOPE — one phone can now be TWO conversations (prospect and
//     resident). Deletion is a hard DELETE with no restore, so it must be
//     scoped to the conversation identity. Scoping it to the phone destroys
//     the other role's thread as collateral.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/co-manager-module-scope", () => ({
  linkedOwnerScopeForModule: vi.fn(async () => ({ ownerIds: [] as string[] })),
}));
vi.mock("@/lib/twilio-provisioning", () => ({
  resolveManagerWorkNumber: vi.fn(async () => "+12065550999"),
  ensureManagerSmsNumber: vi.fn(async () => ({ ok: false, error: "not in tests" })),
}));

import {
  deleteManagerSmsConversation,
  fetchManagerSmsConversations,
} from "@/lib/manager-sms-messages.server";

const MGR = "11111111-1111-1111-1111-111111111111";
const RESIDENT_UID = "22222222-2222-2222-2222-222222222222";
const PHONE = "+12065550100";

type Fixture = Record<string, unknown[]>;

/** Minimal PostgREST-ish stub: records filters, returns the table fixture. */
function makeDb(fixtures: Fixture) {
  const builder = (table: string) => {
    const state = { maybeSingle: false };
    const result = () => {
      if (table === "profiles") {
        return state.maybeSingle
          ? { data: (fixtures.profiles_self ?? [])[0] ?? null, error: null }
          : { data: fixtures.profiles_by_email ?? [], error: null };
      }
      return { data: fixtures[table] ?? [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "in", "order", "limit", "eq", "is", "range", "delete", "or"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = async () => {
      state.maybeSingle = true;
      return result();
    };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  };
  return { from: (table: string) => builder(table) } as never;
}

const appRow = {
  manager_user_id: MGR,
  resident_email: "jane@example.com",
  row_data: { bucket: "approved", name: "Jane Resident", property: "Unit A", phone: PHONE },
};

const inboundRow = (role: string) => ({
  id: "in-1",
  manager_user_id: MGR,
  from_phone: PHONE,
  to_phone: "+12065550999",
  body: "hi it's Jane",
  message_sid: "SM1",
  matched_sender_user_id: RESIDENT_UID,
  counterparty_role: role,
  conversation_key: `${MGR}:${role}:${RESIDENT_UID}`,
  created_at: "2026-07-20T00:00:00.000Z",
});

const base: Fixture = {
  manager_application_records: [appRow],
  profiles_self: [
    { phone: null, phone_verified_at: null, sms_forward_inbound: true, sms_from_number: null },
  ],
  profiles_by_email: [
    { id: RESIDENT_UID, email: "jane@example.com", phone: PHONE, full_name: "Jane Resident" },
  ],
  manager_sms_messages: [],
  sms_relay_threads: [],
};

describe("manager SMS conversation grouping", () => {
  it("folds a resident-stamped row into the named resident's thread", async () => {
    const payload = await fetchManagerSmsConversations(
      makeDb({ ...base, inbound_sms_log: [inboundRow("resident")] }),
      MGR,
    );
    const jane = payload.residents.find((r) => r.name === "Jane Resident");
    expect(jane?.messages.map((m) => m.body)).toEqual(["hi it's Jane"]);
  });

  it("orphans the SAME history when it is stamped prospect — why the backfill order matters", async () => {
    const payload = await fetchManagerSmsConversations(
      makeDb({ ...base, inbound_sms_log: [inboundRow("prospect")] }),
      MGR,
    );
    const jane = payload.residents.find((r) => r.name === "Jane Resident");
    expect(jane?.messages).toEqual([]);
    const orphan = payload.residents.find(
      (r) => r.conversationKey === `${MGR}:prospect:${RESIDENT_UID}`,
    );
    // Unnamed, no email → invisible on the resident detail page's SMS tab.
    expect(orphan?.name).toBe(PHONE);
    expect(orphan?.residentEmail).toBeNull();
  });
});

/** Captures the filter chain of every `.delete()` issued against the stub. */
function makeDeleteSpyDb(rowsByTable: Record<string, { id: string; conversation_key: string | null; phone: string }[]>) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let deleting = false;
    const chain: Record<string, unknown> = {};
    const phoneColumn = table === "inbound_sms_log" ? "from_phone" : "resident_phone";
    chain.delete = () => {
      deleting = true;
      calls.push({ table, filters });
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    };
    chain.in = (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    };
    chain.is = (col: string, val: unknown) => {
      filters[`${col}:is`] = val;
      return chain;
    };
    chain.select = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (!deleting) return Promise.resolve({ data: [], error: null }).then(resolve);
      const matched = (rowsByTable[table] ?? []).filter((row) => {
        if ("conversation_key" in filters && row.conversation_key !== filters.conversation_key) return false;
        if ("conversation_key:is" in filters && row.conversation_key !== null) return false;
        const phones = filters[phoneColumn];
        if (Array.isArray(phones) && !phones.includes(row.phone)) return false;
        return true;
      });
      // Deleted rows are gone for subsequent statements, as in a real DB.
      rowsByTable[table] = (rowsByTable[table] ?? []).filter((r) => !matched.includes(r));
      return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(resolve);
    };
    return chain;
  };
  return { db: { from } as never, calls, rowsByTable };
}

describe("deleteManagerSmsConversation scope", () => {
  const prospectKey = `${MGR}:prospect:${PHONE}`;
  const residentKey = `${MGR}:resident:${RESIDENT_UID}`;

  const seedRows = () => ({
    manager_sms_messages: [
      { id: "m-prospect", conversation_key: prospectKey, phone: PHONE },
      { id: "m-resident", conversation_key: residentKey, phone: PHONE },
    ],
    inbound_sms_log: [
      { id: "i-prospect", conversation_key: prospectKey, phone: PHONE },
      { id: "i-resident", conversation_key: residentKey, phone: PHONE },
    ],
  });

  it("deletes only the targeted conversation, leaving the other role's thread on the same phone", async () => {
    const spy = makeDeleteSpyDb(seedRows());
    const result = await deleteManagerSmsConversation(spy.db, {
      managerUserId: MGR,
      phone: PHONE,
      conversationKey: prospectKey,
    });
    expect(result).toMatchObject({ ok: true });
    expect(spy.rowsByTable.manager_sms_messages.map((r) => r.id)).toEqual(["m-resident"]);
    expect(spy.rowsByTable.inbound_sms_log.map((r) => r.id)).toEqual(["i-resident"]);
    for (const call of spy.calls) {
      expect(call.filters.manager_user_id).toBe(MGR);
    }
  });

  it("still sweeps legacy rows that predate the conversation_key column", async () => {
    const rows = {
      manager_sms_messages: [
        { id: "m-legacy", conversation_key: null, phone: PHONE },
        { id: "m-resident", conversation_key: residentKey, phone: PHONE },
      ],
      inbound_sms_log: [{ id: "i-legacy", conversation_key: null, phone: PHONE }],
    };
    const spy = makeDeleteSpyDb(rows);
    await deleteManagerSmsConversation(spy.db, {
      managerUserId: MGR,
      phone: PHONE,
      conversationKey: prospectKey,
    });
    expect(spy.rowsByTable.manager_sms_messages.map((r) => r.id)).toEqual(["m-resident"]);
    expect(spy.rowsByTable.inbound_sms_log).toEqual([]);
  });

  it("falls back to the phone-wide delete only when no conversation key is supplied", async () => {
    const spy = makeDeleteSpyDb(seedRows());
    await deleteManagerSmsConversation(spy.db, { managerUserId: MGR, phone: PHONE });
    expect(spy.rowsByTable.manager_sms_messages).toEqual([]);
    expect(spy.rowsByTable.inbound_sms_log).toEqual([]);
  });
});
