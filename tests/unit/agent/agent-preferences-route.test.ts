import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUser = vi.fn();
const serviceDb = { marker: "service-db" };
const loadAgentCustomInstructions = vi.fn();
const parseAgentCustomInstructions = vi.fn();
const saveAgentCustomInstructions = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: authGetUser } })),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => serviceDb),
}));
vi.mock("@/lib/agent/user-preferences", () => ({
  loadAgentCustomInstructions: (...args: unknown[]) => loadAgentCustomInstructions(...args),
  parseAgentCustomInstructions: (...args: unknown[]) => parseAgentCustomInstructions(...args),
  saveAgentCustomInstructions: (...args: unknown[]) => saveAgentCustomInstructions(...args),
}));

import { GET, PATCH } from "@/app/api/agent/preferences/route";

function request(body: unknown) {
  return new Request("https://example.test/api/agent/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authGetUser.mockReset();
  loadAgentCustomInstructions.mockReset();
  parseAgentCustomInstructions.mockReset();
  saveAgentCustomInstructions.mockReset();
  authGetUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
});

describe("/api/agent/preferences", () => {
  it("requires an authenticated user", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await PATCH(request({ customInstructions: "hi" }))).status).toBe(401);
  });

  it("reads only the signed-in user's preference from the service client", async () => {
    loadAgentCustomInstructions.mockResolvedValue("Use concise replies.");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ customInstructions: "Use concise replies." });
    expect(loadAgentCustomInstructions).toHaveBeenCalledWith(serviceDb, "user-a");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects an invalid patch without writing", async () => {
    parseAgentCustomInstructions.mockReturnValue({ ok: false, error: "Custom instructions must be text." });
    const res = await PATCH(request({ customInstructions: { not: "text" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Custom instructions must be text." });
    expect(saveAgentCustomInstructions).not.toHaveBeenCalled();
  });

  it("saves a validated value for the authenticated user and supports clearing", async () => {
    parseAgentCustomInstructions.mockReturnValue({ ok: true, value: null });
    saveAgentCustomInstructions.mockResolvedValue({ ok: true });
    const res = await PATCH(request({ customInstructions: "" }));
    expect(res.status).toBe(200);
    expect(saveAgentCustomInstructions).toHaveBeenCalledWith(serviceDb, "user-a", null);
    expect(await res.json()).toEqual({ customInstructions: "" });
  });
});
