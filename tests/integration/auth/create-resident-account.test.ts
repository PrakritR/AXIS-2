import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/analytics/posthog", () => ({
  track: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { POST as createResidentAccount } from "@/app/api/auth/create-resident-account/route";

/** Fake `profiles` table query surface that records update/insert calls. */
function fakeService(existingProfile: { role?: string } | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile }) }),
  });
  const service = {
    from: vi.fn((table: string) => {
      if (table === "profiles") return { select, update, insert };
      return {};
    }),
  };
  return { service, update, insert };
}

function signedInAs(userId: string | null, email = "multi@axis.test") {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId, email } : null } }) },
  } as never);
}

describe("POST /api/auth/create-resident-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated caller with 401 and grants no role", async () => {
    signedInAs(null);
    const res = await createResidentAccount();
    expect(res.status).toBe(401);
    expect(ensureProfileRoleRow).not.toHaveBeenCalled();
  });

  it("adds the resident role to a manager WITHOUT changing their primary role or profile", async () => {
    signedInAs("mgr-1");
    const { service, update, insert } = fakeService({ role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(service as never);

    const res = await createResidentAccount();
    const { status, data } = await parseJsonResponse<{ ok: boolean; redirectTo: string }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/resident/applications/apply");
    // Resident role ADDED…
    expect(ensureProfileRoleRow).toHaveBeenCalledWith(service, "mgr-1", "resident");
    // …and the manager's profile is untouched: role unchanged, so no update, no insert.
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    // Lands them in the resident portal.
    expect(res.headers.get("set-cookie")).toContain("axis_active_portal=resident");
  });

  it("seeds a minimal profile when the authenticated user has none yet", async () => {
    signedInAs("new-1", "new@axis.test");
    const { service, insert } = fakeService(null);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(service as never);

    const res = await createResidentAccount();
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({ id: "new-1", email: "new@axis.test", role: "resident" });
    expect(ensureProfileRoleRow).toHaveBeenCalledWith(service, "new-1", "resident");
  });

  it("is idempotent — re-running for a user who already holds resident does not remove other roles", async () => {
    // The user already holds resident + manager; primary stays manager, resident
    // upsert is a no-op at the DB layer (composite PK), and nothing is removed.
    signedInAs("mgr-1");
    const { service, update } = fakeService({ role: "manager" });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(service as never);

    const res = await createResidentAccount();
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(ensureProfileRoleRow).toHaveBeenCalledWith(service, "mgr-1", "resident");
  });
});
