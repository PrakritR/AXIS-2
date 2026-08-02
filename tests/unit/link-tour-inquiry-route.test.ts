import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/api-request";

vi.mock("@/lib/auth/effective-session", () => ({
  getEffectiveSessionForPortal: vi.fn(),
}));
vi.mock("@/lib/auth/admin-preview", () => ({
  getAdminPreviewFromCookies: vi.fn(),
}));
vi.mock("@/lib/auth/portal-access", () => ({
  getPortalAccessContext: vi.fn(),
  hasRole: (ctx: { roles: string[] }, role: string) => ctx.roles.includes(role),
  hasAdminRole: (ctx: { roles: string[] }) => ctx.roles.includes("admin"),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/tour-resident-link.server", () => ({
  linkTourInquiryToResident: vi.fn(),
}));

import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getPortalAccessContext } from "@/lib/auth/portal-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { linkTourInquiryToResident } from "@/lib/tour-resident-link.server";
import { POST as linkTourInquiry } from "@/app/api/auth/link-tour-inquiry/route";

describe("POST /api/auth/link-tour-inquiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({} as never);
    vi.mocked(getAdminPreviewFromCookies).mockResolvedValue(null);
  });

  it("denies unauthenticated callers", async () => {
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({ user: null, profile: null } as never);
    const res = await linkTourInquiry(
      jsonRequest("http://localhost/api/auth/link-tour-inquiry", {
        method: "POST",
        body: { tourInquiryId: "inq-1" },
      }),
    );
    expect(res.status).toBe(401);
    expect(linkTourInquiryToResident).not.toHaveBeenCalled();
  });

  it("denies non-resident roles", async () => {
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({
      user: { id: "mgr-1" },
      profile: { role: "manager", email: "mgr@example.com" },
    } as never);
    vi.mocked(getPortalAccessContext).mockResolvedValue({ roles: ["manager"] } as never);
    const res = await linkTourInquiry(
      jsonRequest("http://localhost/api/auth/link-tour-inquiry", {
        method: "POST",
        body: { tourInquiryId: "inq-1" },
      }),
    );
    expect(res.status).toBe(403);
    expect(linkTourInquiryToResident).not.toHaveBeenCalled();
  });

  it("links a tour for authenticated residents", async () => {
    vi.mocked(getEffectiveSessionForPortal).mockResolvedValue({
      user: { id: "res-1", email: "res@example.com" },
      profile: { role: "resident", email: "res@example.com" },
    } as never);
    vi.mocked(getPortalAccessContext).mockResolvedValue({ roles: ["resident"] } as never);
    vi.mocked(linkTourInquiryToResident).mockResolvedValue({ ok: true, linked: true, inquiryId: "inq-1" });
    const res = await linkTourInquiry(
      jsonRequest("http://localhost/api/auth/link-tour-inquiry", {
        method: "POST",
        body: { tourInquiryId: "inq-1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(linkTourInquiryToResident).toHaveBeenCalledWith(expect.anything(), {
      userId: "res-1",
      inquiryId: "inq-1",
      email: "res@example.com",
    });
  });
});
