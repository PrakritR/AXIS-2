import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/auth/admin-preview", () => ({
  isAdminUser: vi.fn(),
  PREVIEW_PORTAL_COOKIE: "axis_preview_portal",
  PREVIEW_UID_COOKIE: "axis_preview_uid",
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { POST as adminPreview } from "@/app/api/admin/preview/route";

describe("POST /api/admin/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin users", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    } as never);
    vi.mocked(isAdminUser).mockResolvedValue(false);

    const req = new Request("http://localhost/api/admin/preview", {
      method: "POST",
      body: JSON.stringify({ targetUserId: "mgr-1", portal: "manager" }),
      headers: { "content-type": "application/json" },
    });
    const res = await adminPreview(req);
    expect(res.status).toBe(403);
  });
});
