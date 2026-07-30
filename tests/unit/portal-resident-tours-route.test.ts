import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getResidentTours } from "@/app/api/portal-resident-tours/route";

vi.mock("@/lib/auth/effective-session", () => ({
  getEffectiveSessionForPortal: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/tour-resident-link.server", () => ({
  loadResidentTourViews: vi.fn(),
}));

import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { loadResidentTourViews } from "@/lib/tour-resident-link.server";

describe("GET /api/portal-resident-tours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies unauthenticated callers", async () => {
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({ user: null, profile: null } as never);
    const res = await getResidentTours();
    expect(res.status).toBe(401);
    expect(loadResidentTourViews).not.toHaveBeenCalled();
  });

  it("denies non-resident roles", async () => {
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({
      user: { id: "mgr-1" },
      profile: { role: "manager", email: "mgr@example.com" },
    } as never);
    const res = await getResidentTours();
    expect(res.status).toBe(403);
    expect(loadResidentTourViews).not.toHaveBeenCalled();
  });

  it("returns only linked tours for authenticated residents", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({} as never);
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({
      user: { id: "res-1" },
      profile: { role: "resident", email: "res@example.com" },
    } as never);
    vi.mocked(loadResidentTourViews).mockResolvedValue([
      { inquiryId: "inq-1", status: "pending", confirmed: false },
    ] as never);
    const res = await getResidentTours();
    expect(res.status).toBe(200);
    expect(loadResidentTourViews).toHaveBeenCalledWith(expect.anything(), "res-1");
    const body = (await res.json()) as { tours: unknown[] };
    expect(body.tours).toHaveLength(1);
  });
});
