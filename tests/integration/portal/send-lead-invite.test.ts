import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/manager-property-links", () => ({
  buildManagerApplyUrl: vi.fn((origin: string, params: { propertyId: string }) => `${origin}/rent/apply?propertyId=${params.propertyId}`),
  buildManagerTourUrl: vi.fn((origin: string, propertyId: string) => `${origin}/rent/tours-contact?propertyId=${propertyId}`),
  buildManagerListingUrl: vi.fn((origin: string, propertyId: string) => `${origin}/rent/listings/${propertyId}`),
  buildManagerBrowseUrl: vi.fn((origin: string, ids: string[]) => `${origin}/rent/browse?ids=${ids.join(",")}`),
}));

vi.mock("@/lib/manager-property-share-access", () => ({
  getShareablePropertyForUser: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getShareablePropertyForUser } from "@/lib/manager-property-share-access";
import { POST as sendLeadInvite } from "@/app/api/portal/send-lead-invite/route";

describe("POST /api/portal/send-lead-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "apply", to: "prospect@example.com", propertyId: "mgr-1" },
    });
    const res = await sendLeadInvite(req);
    expect(res.status).toBe(401);
  });

  it("validates required fields", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "mgr@example.com" } } }) },
    } as never);

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "tour", to: "bad-email", propertyId: "" },
    });
    const res = await sendLeadInvite(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 403 when the manager does not own (and is not assigned) the property", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "mgr@example.com" } } }) },
    } as never);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }),
          }),
        }),
      }),
    } as never);
    // Server-side ownership check rejects a property this manager doesn't own.
    vi.mocked(getShareablePropertyForUser).mockResolvedValue(null);

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "listing", to: "prospect@example.com", propertyId: "other-managers-prop" },
    });
    const res = await sendLeadInvite(req);
    expect(res.status).toBe(403);
    expect(getShareablePropertyForUser).toHaveBeenCalledWith("user-1", "other-managers-prop");
  });

  it("sends invite email when authorized and Resend succeeds", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "mgr@example.com" } } }) },
    } as never);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }),
          }),
        }),
      }),
    } as never);
    vi.mocked(getShareablePropertyForUser).mockResolvedValue({
      id: "mgr-1",
      title: "Test House",
      adminPublishLive: true,
    } as never);
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "tour", to: "prospect@example.com", propertyId: "mgr-1", note: "See you soon" },
    });
    const res = await sendLeadInvite(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; linkUrl?: string }>(res);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.linkUrl).toContain("/rent/tours-contact?propertyId=mgr-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends a filtered browse link when several listings are shared at once", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "mgr@example.com" } } }) },
    } as never);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }),
          }),
        }),
      }),
    } as never);
    // Every requested id is owned by this manager.
    vi.mocked(getShareablePropertyForUser).mockImplementation(
      async (_userId: string, id: string) => ({ id, title: `House ${id}`, adminPublishLive: true }) as never,
    );
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "email_2" }), { status: 200 }));

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "listing", to: "prospect@example.com", propertyIds: ["mgr-1", "mgr-2", "mgr-3"] },
    });
    const res = await sendLeadInvite(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; linkUrl?: string }>(res);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.linkUrl).toContain("/rent/browse?ids=mgr-1,mgr-2,mgr-3");
    // The email body must carry the browse link, not a single-listing apply link.
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as { text: string };
    expect(sentBody.text).toContain("/rent/browse?ids=mgr-1,mgr-2,mgr-3");
    expect(sentBody.text).toContain("shared 3 homes");
  });

  it("rejects the whole multi-send if any requested listing is not authorized", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "mgr@example.com" } } }) },
    } as never);
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "manager" }, error: null }),
          }),
        }),
      }),
    } as never);
    // mgr-2 belongs to another manager — the send must fail rather than silently drop it.
    vi.mocked(getShareablePropertyForUser).mockImplementation(
      async (_userId: string, id: string) =>
        id === "mgr-2" ? null : ({ id, title: `House ${id}`, adminPublishLive: true } as never),
    );

    const req = jsonRequest("http://localhost/api/portal/send-lead-invite", {
      method: "POST",
      body: { kind: "listing", to: "prospect@example.com", propertyIds: ["mgr-1", "mgr-2"] },
    });
    const res = await sendLeadInvite(req);
    expect(res.status).toBe(403);
  });
});
