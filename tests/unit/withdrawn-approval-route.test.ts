import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Server-side money-path guard for PATCH /api/portal/resident-approval.
 *
 * A resident-withdrawn application keeps `bucket === "pending"` — it only gets a
 * neutral "Withdrawn" stamp — so the manager UI could still surface Approve on it
 * (fixed separately). Approving it flips the resident profile's
 * `application_approved` flag (account provisioning) for someone who explicitly
 * pulled out. The manager UI now hides Approve for withdrawn rows, but the UI is
 * not a security boundary: this route must reject the approval on its own,
 * scoped to the acting manager's own record.
 */

const getUser = vi.fn();
let REQUESTOR: { role: string; email: string; sms_from_number: string | null } | null;
let APP_ROW: { id: string; row_data: DemoApplicantRow | null; resident_email: string } | null;
let PROFILE_UPDATE_CALLS: number;

vi.mock("@/lib/analytics/posthog", () => ({ track: vi.fn() }));
vi.mock("@/lib/application-lifecycle-sms.server", () => ({ notifyApplicantApplicationSms: vi.fn() }));
vi.mock("@/lib/manager-applications-storage", () => ({
  normalizeApplicationAxisId: (id: string) => id.trim(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => makeServiceClient(),
}));

/**
 * Minimal chainable Supabase stub. `maybeSingle()` resolves per-table (the
 * requestor profile, then the application record the guard inspects); the update
 * chain is awaited directly, so the builder is also thenable and records that a
 * profile write was attempted — a withdrawn approval must never reach it.
 */
function makeServiceClient() {
  return {
    from(table: string) {
      let op: "select" | "update" = "select";
      const builder: Record<string, unknown> = {
        select() {
          op = "select";
          return builder;
        },
        update() {
          op = "update";
          if (table === "profiles") PROFILE_UPDATE_CALLS += 1;
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          if (table === "profiles") return Promise.resolve({ data: REQUESTOR, error: null });
          if (table === "manager_application_records") return Promise.resolve({ data: APP_ROW, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (v: { error: null }) => unknown) {
          void op;
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

function patch(body: unknown) {
  return new Request("http://localhost/api/portal/resident-approval", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function appRow(over: Partial<DemoApplicantRow>): DemoApplicantRow {
  return {
    id: "AXIS-9001",
    name: "Withdrawn Applicant",
    property: "The Pioneer",
    stage: "Submitted",
    bucket: "pending",
    detail: "",
    email: "applicant@example.com",
    ...over,
  };
}

describe("PATCH /api/portal/resident-approval — withdrawn applications are not approvable", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "mgr-1" } } });
    REQUESTOR = { role: "manager", email: "mgr@example.com", sms_from_number: null };
    APP_ROW = { id: "AXIS-9001", row_data: appRow({}), resident_email: "applicant@example.com" };
    PROFILE_UPDATE_CALLS = 0;
  });

  it("rejects approving a withdrawn application (409) and never writes application_approved", async () => {
    APP_ROW = {
      id: "AXIS-9001",
      row_data: appRow({ withdrawnAt: "2026-07-22T00:00:00.000Z" }),
      resident_email: "applicant@example.com",
    };
    const { PATCH } = await import("@/app/api/portal/resident-approval/route");
    const res = await PATCH(
      patch({ email: "applicant@example.com", approved: true, applicationId: "AXIS-9001" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/withdrawn/i);
    // The provisioning write must not have happened.
    expect(PROFILE_UPDATE_CALLS).toBe(0);
  });

  it("rejects even when the client omits applicationId (falls back to the manager's latest record)", async () => {
    APP_ROW = {
      id: "AXIS-9001",
      row_data: appRow({ withdrawnAt: "2026-07-22T00:00:00.000Z" }),
      resident_email: "applicant@example.com",
    };
    const { PATCH } = await import("@/app/api/portal/resident-approval/route");
    const res = await PATCH(patch({ email: "applicant@example.com", approved: true }));
    expect(res.status).toBe(409);
    expect(PROFILE_UPDATE_CALLS).toBe(0);
  });

  it("still approves a normal (non-withdrawn) application — the guard does not over-block", async () => {
    APP_ROW = { id: "AXIS-9001", row_data: appRow({ withdrawnAt: null }), resident_email: "applicant@example.com" };
    const { PATCH } = await import("@/app/api/portal/resident-approval/route");
    const res = await PATCH(
      patch({ email: "applicant@example.com", approved: true, applicationId: "AXIS-9001" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(PROFILE_UPDATE_CALLS).toBe(1);
  });
});
