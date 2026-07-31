import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../helpers/api-request";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
  isAdminUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: mocks.createSupabaseServiceRoleClient,
}));

vi.mock("@/lib/auth/admin-preview", () => ({
  isAdminUser: mocks.isAdminUser,
}));

import { GET, POST } from "@/app/api/bug-feedback-attachments/route";
import { BUG_FEEDBACK_ATTACHMENTS_BUCKET } from "@/lib/bug-feedback-attachments.server";

const USER_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function mockServerUser(user: { id: string } | null) {
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user } }),
    },
  });
}

function mockStorage(uploaded: string[] = [], downloaded: string[] = []) {
  return {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        if (bucket !== BUG_FEEDBACK_ATTACHMENTS_BUCKET) {
          return { error: { message: `unexpected bucket ${bucket}` } };
        }
        uploaded.push(path);
        return { error: null };
      },
      download: async (path: string) => {
        if (bucket !== BUG_FEEDBACK_ATTACHMENTS_BUCKET) {
          return { data: null, error: { message: `unexpected bucket ${bucket}` } };
        }
        downloaded.push(path);
        return { data: new Blob(["img"], { type: "image/png" }), error: null };
      },
    }),
  };
}

describe("bug-feedback-attachments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminUser.mockResolvedValue(false);
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage() });
  });

  it("uploads to the private bug-feedback-attachments bucket and returns an app URL", async () => {
    const uploaded: string[] = [];
    mockServerUser({ id: USER_ID });
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage(uploaded) });

    const res = await POST(
      jsonRequest("http://t/api/bug-feedback-attachments", {
        method: "POST",
        body: { dataUrl: PNG_DATA_URL, ext: "png" },
      }),
    );
    const { status, data } = await parseJsonResponse<{ url?: string }>(res);

    expect(status).toBe(200);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(new RegExp(`^bug-feedback/${USER_ID}/`));
    expect(data.url).toBe(`/api/bug-feedback-attachments?path=${encodeURIComponent(uploaded[0]!)}`);
    expect(data.url).not.toContain("object/public");
  });

  it("refuses unauthenticated read", async () => {
    mockServerUser(null);

    const path = `bug-feedback/${USER_ID}/shot.png`;
    const res = await GET(jsonRequest(`http://t/api/bug-feedback-attachments?path=${encodeURIComponent(path)}`));
    const { status, data } = await parseJsonResponse<{ error?: string }>(res);

    expect(status).toBe(401);
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("streams for the owning reporter", async () => {
    const path = `bug-feedback/${USER_ID}/shot.png`;
    const downloaded: string[] = [];
    mockServerUser({ id: USER_ID });
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage([], downloaded) });

    const res = await GET(jsonRequest(`http://t/api/bug-feedback-attachments?path=${encodeURIComponent(path)}`));
    expect(res.status).toBe(200);
    expect(downloaded).toEqual([path]);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("refuses another user's attachment", async () => {
    const path = `bug-feedback/other-user/shot.png`;
    mockServerUser({ id: USER_ID });
    mocks.isAdminUser.mockResolvedValue(false);

    const res = await GET(jsonRequest(`http://t/api/bug-feedback-attachments?path=${encodeURIComponent(path)}`));
    expect(res.status).toBe(404);
  });

  it("allows admin to read any attachment", async () => {
    const path = `bug-feedback/other-user/shot.png`;
    const downloaded: string[] = [];
    mockServerUser({ id: "admin-1" });
    mocks.isAdminUser.mockResolvedValue(true);
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage([], downloaded) });

    const res = await GET(jsonRequest(`http://t/api/bug-feedback-attachments?path=${encodeURIComponent(path)}`));
    expect(res.status).toBe(200);
    expect(downloaded).toEqual([path]);
  });
});
