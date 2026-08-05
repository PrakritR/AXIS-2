/**
 * `POST /api/agent/feedback` — the agent's only quality signal.
 *
 * The trace id in the body is NOT authorization. Without the ownership re-check
 * any signed-in user could score any trace, poisoning another tenant's
 * satisfaction metric and turning the route into an existence oracle for trace
 * ids. These tests pin that gate, plus the input validation and the honest
 * `scored:false` when Langfuse is unconfigured.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: vi.mock factories are lifted above normal const declarations, so
// the spies they close over have to be hoisted too.
const { getUser, scoreAgentTrace, track, maybeSingle, state } = vi.hoisted(() => ({
  getUser: vi.fn(),
  scoreAgentTrace: vi.fn(),
  track: vi.fn(),
  maybeSingle: vi.fn(),
  /** Records the filters the route applied, so we can assert it scoped by owner. */
  state: { appliedFilters: [] as Array<[string, unknown]> },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          state.appliedFilters.push([col, val]);
          return chain;
        },
        limit: () => chain,
        maybeSingle,
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/observability/langfuse", () => ({ scoreAgentTrace }));
vi.mock("@/lib/analytics/posthog", () => ({ track }));

import { POST } from "@/app/api/agent/feedback/route";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const TRACE = "lf-trace-abc123";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/agent/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.appliedFilters = [];
  getUser.mockResolvedValue({ data: { user: USER } });
  maybeSingle.mockResolvedValue({ data: { id: "msg-1", session_id: "sess-1" }, error: null });
  scoreAgentTrace.mockResolvedValue(true);
});

describe("POST /api/agent/feedback", () => {
  it("rejects a signed-out caller before touching Langfuse", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ traceId: TRACE, rating: "up" }));
    expect(res.status).toBe(401);
    expect(scoreAgentTrace).not.toHaveBeenCalled();
  });

  it("scores a trace the caller owns", async () => {
    const res = await POST(req({ traceId: TRACE, rating: "down", comment: "wrong balance" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, scored: true });
    expect(scoreAgentTrace).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: TRACE, rating: "down", userId: USER.id, comment: "wrong balance" }),
    );
  });

  it("scopes the ownership lookup to the caller's own sessions", async () => {
    await POST(req({ traceId: TRACE, rating: "up" }));
    // Both halves matter: the trace id alone would match another tenant's row.
    expect(state.appliedFilters).toContainEqual(["tool_trace->>traceId", TRACE]);
    expect(state.appliedFilters).toContainEqual(["agent_sessions.user_id", USER.id]);
  });

  it("404s a trace the caller does not own, and never scores it", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(req({ traceId: "someone-elses-trace", rating: "up" }));
    expect(res.status).toBe(404);
    expect(scoreAgentTrace).not.toHaveBeenCalled();
  });

  it("500s a failed lookup rather than scoring unverified", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(req({ traceId: TRACE, rating: "up" }));
    expect(res.status).toBe(500);
    expect(scoreAgentTrace).not.toHaveBeenCalled();
  });

  it("rejects a rating outside up/down", async () => {
    const res = await POST(req({ traceId: TRACE, rating: "excellent" }));
    expect(res.status).toBe(400);
    expect(scoreAgentTrace).not.toHaveBeenCalled();
  });

  it("requires a trace id", async () => {
    const res = await POST(req({ rating: "up" }));
    expect(res.status).toBe(400);
  });

  it("reports scored:false honestly when Langfuse is unconfigured", async () => {
    scoreAgentTrace.mockResolvedValue(false);
    const res = await POST(req({ traceId: TRACE, rating: "up" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, scored: false });
  });

  it("sends no PII to product analytics", async () => {
    await POST(req({ traceId: TRACE, rating: "down", comment: "my email is a@b.com" }));
    const [, , props] = track.mock.calls[0]!;
    expect(props).toEqual({ rating: "down", hasComment: true });
  });
});
