/**
 * `POST /api/property-records` used to let an ADMIN caller move an EXISTING
 * listing between managers, because the owner it wrote was
 * `body.managerUserId || existingOwnerId || user.id` — the request body won.
 *
 * Every client that posts here mirrors `managerUserId` straight out of a
 * browser-local pipeline bucket (`mirrorLocalPropertyPipelineToServer`,
 * `mirrorAdminPropertyRecord`, `promoteLegacyPendingListingsToLive`), so a stale
 * local bucket keyed by an old/other user id silently handed live listings to
 * that account. That is exactly what emptied a real manager's Properties tab:
 * the GET scopes strictly by `manager_user_id`, so the tab read 0/0/0, while
 * Residents, Applications, and the Communication property filter — which read
 * denormalized property labels off application/lease rows
 * (`propertyOptionsFromContacts`) — kept listing the same houses.
 *
 * Ownership changes now have exactly one door: `transferPropertyOwnership`
 * (requires an accepted co-manager link, notifies both sides).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/api-request";

const getUser = vi.fn();
let IS_ADMIN = false;
let EXISTING_ROW: { manager_user_id: string } | null = null;
let UPSERTS: Record<string, unknown>[] = [];
let DELETED_IDS: string[] = [];
let CO_MANAGER_ACCESS: { ok: true } | { ok: false; error: string; status: number } = {
  ok: false,
  error: "Forbidden.",
  status: 403,
};

vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: async () => IS_ADMIN }));
vi.mock("@/lib/auth/co-manager-access", () => ({
  assertCoManagerModuleAccess: async () => CO_MANAGER_ACCESS,
}));
vi.mock("@/lib/auth/clear-property-housing-access", () => ({
  clearHousingAccessForDeletedProperty: async () => {},
}));
vi.mock("@/lib/analytics/posthog", () => ({ track: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: EXISTING_ROW, error: null }) }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        UPSERTS.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, value: string) => {
          DELETED_IDS.push(value);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { POST as postPropertyRecord } from "@/app/api/property-records/route";

const OWNER = "mgr-real-owner";
const OTHER_MANAGER = "mgr-legacy-account";
const ADMIN = "admin-1";
const CO_MANAGER = "mgr-co-1";
const PROPERTY_ID = "mgr-demo-cascade";

function post(body: Record<string, unknown>) {
  return postPropertyRecord(
    jsonRequest("http://localhost/api/property-records", { method: "POST", body }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  IS_ADMIN = false;
  EXISTING_ROW = { manager_user_id: OWNER };
  UPSERTS = [];
  DELETED_IDS = [];
  CO_MANAGER_ACCESS = { ok: false, error: "Forbidden.", status: 403 };
});

describe("POST /api/property-records — an existing listing's owner is not caller-supplied", () => {
  it("ignores a foreign managerUserId from an ADMIN and keeps the stored owner", async () => {
    IS_ADMIN = true;
    getUser.mockResolvedValue({ data: { user: { id: ADMIN } } });

    const res = await post({
      action: "upsert",
      id: PROPERTY_ID,
      managerUserId: OTHER_MANAGER,
      status: "live",
      propertyData: { id: PROPERTY_ID, managerUserId: OTHER_MANAGER },
    });

    expect(res.status).toBe(200);
    expect(UPSERTS).toHaveLength(1);
    expect(UPSERTS[0].manager_user_id).toBe(OWNER);
  });

  it("ignores a foreign managerUserId from the OWNER's own client", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    const res = await post({
      action: "upsert",
      id: PROPERTY_ID,
      managerUserId: OTHER_MANAGER,
      status: "live",
      propertyData: { id: PROPERTY_ID },
    });

    expect(res.status).toBe(200);
    expect(UPSERTS[0].manager_user_id).toBe(OWNER);
  });

  it("keeps the owner when a permitted co-manager edits the listing", async () => {
    CO_MANAGER_ACCESS = { ok: true };
    getUser.mockResolvedValue({ data: { user: { id: CO_MANAGER } } });

    const res = await post({
      action: "upsert",
      id: PROPERTY_ID,
      managerUserId: CO_MANAGER,
      status: "live",
      propertyData: { id: PROPERTY_ID },
    });

    expect(res.status).toBe(200);
    expect(UPSERTS[0].manager_user_id).toBe(OWNER);
  });

  it("still refuses a co-manager without the properties module", async () => {
    getUser.mockResolvedValue({ data: { user: { id: CO_MANAGER } } });

    const res = await post({ action: "upsert", id: PROPERTY_ID, status: "live", propertyData: {} });

    expect(res.status).toBe(403);
    expect(UPSERTS).toHaveLength(0);
  });
});

describe("POST /api/property-records — creating a record still attributes normally", () => {
  it("lets an admin create a NEW record on a manager's behalf", async () => {
    IS_ADMIN = true;
    EXISTING_ROW = null;
    getUser.mockResolvedValue({ data: { user: { id: ADMIN } } });

    const res = await post({
      action: "upsert",
      id: "mgr-brand-new",
      managerUserId: OWNER,
      status: "live",
      propertyData: { id: "mgr-brand-new" },
    });

    expect(res.status).toBe(200);
    expect(UPSERTS[0].manager_user_id).toBe(OWNER);
  });

  it("refuses a non-admin creating a record owned by someone else", async () => {
    EXISTING_ROW = null;
    getUser.mockResolvedValue({ data: { user: { id: CO_MANAGER } } });

    const res = await post({
      action: "upsert",
      id: "mgr-brand-new",
      managerUserId: OWNER,
      status: "live",
      propertyData: {},
    });

    expect(res.status).toBe(403);
    expect(UPSERTS).toHaveLength(0);
  });

  it("adopts an ownerless legacy row under the manager saving it", async () => {
    EXISTING_ROW = { manager_user_id: "" };
    getUser.mockResolvedValue({ data: { user: { id: OWNER } } });

    const res = await post({ action: "upsert", id: PROPERTY_ID, status: "live", propertyData: {} });

    expect(res.status).toBe(200);
    expect(UPSERTS[0].manager_user_id).toBe(OWNER);
  });

  it("keeps delete authorized by the stored owner, not the body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: CO_MANAGER } } });

    const res = await post({ action: "delete", id: PROPERTY_ID, managerUserId: CO_MANAGER });

    expect(res.status).toBe(403);
    expect(DELETED_IDS).toHaveLength(0);
  });
});
