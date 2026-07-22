import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A submitted application must never be reverted to an "In progress" draft.
 *
 * The wizard fires an UNAWAITED draft sync (`syncInProgressApplicationRow`) on
 * every form change, so one of those POSTs is routinely still in flight when
 * the submit POST lands. Both requests carry the same axis id and both return
 * 200, so whichever upsert reaches the table last wins. When the draft wins,
 * the manager never sees the application and the resident sees a draft — a
 * silent loss of the core apply flow.
 *
 * These run the real POST handler against an in-memory
 * `manager_application_records` fake, in the exact order that loses data.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  records: [] as Row[],
  user: null as { id: string; email?: string } | null,
  profile: null as Row | null,
}));

function makeFakeDb() {
  function builder(table: string) {
    const rows = table === "profiles" ? (state.profile ? [state.profile] : []) : state.records;
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "delete" = "select";

    const matched = () => rows.filter((row) => filters.every((fn) => fn(row)));

    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return api;
      },
      limit() {
        return Promise.resolve({ data: matched().slice(0, 1), error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: matched()[0] ?? null, error: null });
      },
      delete() {
        mode = "delete";
        return api;
      },
      upsert(values: Row) {
        const idx = state.records.findIndex((row) => row.id === values.id);
        if (idx >= 0) state.records[idx] = { ...state.records[idx], ...values };
        else state.records.push({ ...values });
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        if (mode === "delete") {
          const doomed = new Set(matched());
          state.records = state.records.filter((row) => !doomed.has(row));
        }
        return Promise.resolve(resolve({ data: matched(), error: null }));
      },
    };
    return api;
  }
  return { from: builder };
}

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => makeFakeDb(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));

vi.mock("@/lib/auth/link-resident-on-application-submit", () => ({
  linkResidentOnApplicationSubmit: async (_db: unknown, params: { row: Row }) => params.row,
}));

vi.mock("@/lib/auth/provision-approved-resident", () => ({
  provisionApprovedResidentAccount: async () => ({ ok: true }),
}));

vi.mock("@/lib/screening/order-screening", () => ({
  tryAutoOrderScreening: async () => undefined,
}));

vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: async () => false }));

import { POST } from "@/app/api/manager-applications/route";

const AXIS_ID = "PROPLANE-GRP12345";
const RESIDENT_EMAIL = "applicant@test.com";

function applicationRow(stage: "Submitted" | "In progress"): Row {
  return {
    id: AXIS_ID,
    name: "Jane Applicant",
    property: "Willow House",
    propertyId: "prop-willow",
    managerUserId: "mgr-1",
    stage,
    bucket: "pending",
    backgroundCheckStatus: "pending_review",
    detail: stage === "Submitted" ? "Submitted now" : "Started now",
    email: RESIDENT_EMAIL,
    application: { propertyId: "prop-willow", email: RESIDENT_EMAIL, groupId: "AXISGRP-TZNQYRN8" },
  };
}

async function postUpsert(row: Row) {
  const req = new Request("http://localhost/api/manager-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert", row }),
  });
  return POST(req);
}

function storedRow(): Row | undefined {
  return state.records.find((r) => r.id === AXIS_ID)?.row_data as Row | undefined;
}

describe("submitted applications survive a trailing in-progress draft write", () => {
  beforeEach(() => {
    state.records = [];
    state.user = { id: "resident-1", email: RESIDENT_EMAIL };
    state.profile = { id: "resident-1", email: RESIDENT_EMAIL, role: "resident" };
  });

  it("keeps the submitted snapshot when a draft sync lands after submit", async () => {
    const submit = await postUpsert(applicationRow("Submitted"));
    expect(submit.status).toBe(200);
    expect(storedRow()?.stage).toBe("Submitted");

    // The draft POST the wizard fired before submit finally reaches the server.
    const trailingDraft = await postUpsert(applicationRow("In progress"));
    expect(trailingDraft.status).toBe(200);

    expect(storedRow()?.stage).toBe("Submitted");
    expect(storedRow()?.bucket).toBe("pending");
  });

  it("still lets a genuine draft resume write in progress before any submit", async () => {
    const first = await postUpsert(applicationRow("In progress"));
    expect(first.status).toBe(200);
    expect(storedRow()?.stage).toBe("In progress");

    const resumed = { ...applicationRow("In progress"), name: "Jane A. Applicant" };
    const second = await postUpsert(resumed);
    expect(second.status).toBe(200);
    expect(storedRow()?.stage).toBe("In progress");
    expect(storedRow()?.name).toBe("Jane A. Applicant");
  });

  it("still lets the manager move a submitted application forward", async () => {
    await postUpsert(applicationRow("Submitted"));
    state.user = { id: "mgr-1", email: "mgr@test.com" };
    state.profile = { id: "mgr-1", email: "mgr@test.com", role: "manager" };

    const approved = { ...applicationRow("Submitted"), stage: "Approved", bucket: "approved" };
    const res = await postUpsert(approved);
    expect(res.status).toBe(200);
    expect(storedRow()?.stage).toBe("Approved");
  });
});
