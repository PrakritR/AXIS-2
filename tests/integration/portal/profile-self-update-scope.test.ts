import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../../helpers/api-request";

/**
 * `PATCH /api/profile` is the *only* self-service write path onto `profiles`
 * now that `authenticated` holds no DML there
 * (20260722123000_lock_role_grant_surface.sql) — a self-service UPDATE grant is
 * indistinguishable from a self-service `role = 'admin'` grant, because column
 * authority cannot be expressed in an RLS row predicate.
 *
 * So this route carries the whole boundary: it must authorize the session
 * server-side, write with elevated privilege, pin the write to the caller's own
 * row, and accept nothing from the body except the two display fields.
 */

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { PATCH as patchProfile } from "@/app/api/profile/route";

const USER = "user-1";

function sessionClient(userId: string | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
    from: vi.fn(() => {
      throw new Error("the session client must not be used to write profiles");
    }),
  } as never;
}

function serviceClient() {
  const updates: { patch: Record<string, unknown>; scopedTo: [string, string] }[] = [];
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { phone: "+15551110000" }, error: null }) })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn((col: string, val: string) => {
          updates.push({ patch, scopedTo: [col, val] });
          return Promise.resolve({ error: null });
        }),
      })),
    })),
  } as never;
  return { client, updates };
}

describe("PATCH /api/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sessionClient(null));
    const svc = serviceClient();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(svc.client);

    const res = await patchProfile(
      jsonRequest("http://localhost/api/profile", { method: "PATCH", body: { fullName: "A" } }),
    );
    expect(res.status).toBe(401);
    expect(svc.updates).toHaveLength(0);
  });

  it("writes with the service-role client, never the caller's session", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sessionClient(USER));
    const svc = serviceClient();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(svc.client);

    const res = await patchProfile(
      jsonRequest("http://localhost/api/profile", {
        method: "PATCH",
        body: { fullName: "Real Name", phone: "+15552223333" },
      }),
    );
    expect(res.status).toBe(200);
    expect(createSupabaseServiceRoleClient).toHaveBeenCalled();
    expect(svc.updates).toHaveLength(1);
  });

  it("pins the write to the caller's own row", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sessionClient(USER));
    const svc = serviceClient();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(svc.client);

    await patchProfile(
      jsonRequest("http://localhost/api/profile", { method: "PATCH", body: { fullName: "Real Name" } }),
    );
    expect(svc.updates[0].scopedTo).toEqual(["id", USER]);
  });

  it("ignores every privileged field the body tries to smuggle in", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sessionClient(USER));
    const svc = serviceClient();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(svc.client);

    await patchProfile(
      jsonRequest("http://localhost/api/profile", {
        method: "PATCH",
        body: {
          fullName: "Real Name",
          role: "admin",
          email: "founders@axis-seattle-housing.com",
          id: "someone-else",
          manager_id: "AXIS-VICTIM",
          sms_from_number: "+15559990000",
          phone_verified_at: new Date().toISOString(),
          application_approved: true,
          stripe_connect_account_id: "acct_attacker",
        },
      }),
    );

    const written = Object.keys(svc.updates[0].patch).sort();
    // Only these four may ever be written, and `phone_verified_at` only as a
    // *clear* triggered by a phone change — never a value taken from the body.
    expect(written.every((k) => ["full_name", "phone", "phone_verified_at", "updated_at"].includes(k))).toBe(true);
    if ("phone_verified_at" in svc.updates[0].patch) {
      expect(svc.updates[0].patch.phone_verified_at).toBeNull();
    }
    expect(svc.updates[0].patch).not.toHaveProperty("role");
    expect(svc.updates[0].patch).not.toHaveProperty("email");
    expect(svc.updates[0].patch).not.toHaveProperty("sms_from_number");
    expect(svc.updates[0].scopedTo).toEqual(["id", USER]);
  });

  it("clears phone_verified_at when the phone changes, and never sets it", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sessionClient(USER));
    const svc = serviceClient();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(svc.client);

    await patchProfile(
      jsonRequest("http://localhost/api/profile", {
        method: "PATCH",
        body: { fullName: "Real Name", phone: "+15559998888", phone_verified_at: "2099-01-01T00:00:00.000Z" },
      }),
    );
    expect(svc.updates[0].patch.phone_verified_at).toBeNull();
  });
});
