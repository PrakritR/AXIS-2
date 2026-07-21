import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level coverage for GET /api/webhooks/claw-messenger/manager-phones —
 * the endpoint the Claw gateway polls for its reply-debounce manager bypass.
 * Verifies the bearer gate and that the body only ever carries HMAC digests
 * of registered managers' verified phones, never raw phone numbers.
 */

const queryQueue: Array<{ data: unknown[] | null }> = [];
function chain(result: { data: unknown[] | null }) {
  const q: Record<string, unknown> = {};
  const ret = () => q;
  for (const m of ["select", "eq", "in", "order", "limit", "not"]) q[m] = ret;
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return q;
}
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => chain(queryQueue.shift() ?? { data: [] }),
  }),
}));

import { GET } from "@/app/api/webhooks/claw-messenger/manager-phones/route";

const API_KEY = "route-test-key";
const ROUTE_URL = "https://axis.test/api/webhooks/claw-messenger/manager-phones";

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: "mgr-1",
    email: "real@landlord.com",
    full_name: "Real Landlord",
    phone: "2065550111",
    phone_verified_at: "2026-01-01T00:00:00Z",
    sms_from_number: "+12053690702",
    role: "manager",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function expectedHash(phoneE164: string): string {
  return createHmac("sha256", API_KEY).update(phoneE164.replace(/\D/g, "")).digest("hex");
}

beforeEach(() => {
  queryQueue.length = 0;
  process.env.CLAW_MESSENGER_ENABLED = "1";
  process.env.CLAW_MESSENGER_API_KEY = API_KEY;
  delete process.env.CLAW_MESSENGER_MANAGER_EMAILS;
  delete process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES;
});

describe("GET /api/webhooks/claw-messenger/manager-phones", () => {
  it("503s when Claw Messenger is not configured", async () => {
    delete process.env.CLAW_MESSENGER_API_KEY;
    const res = await GET(new Request(ROUTE_URL));
    expect(res.status).toBe(503);
  });

  it("401s without a bearer token and with a wrong bearer token", async () => {
    const noAuth = await GET(new Request(ROUTE_URL));
    expect(noAuth.status).toBe(401);

    const wrongAuth = await GET(
      new Request(ROUTE_URL, { headers: { Authorization: "Bearer not-the-key" } }),
    );
    expect(wrongAuth.status).toBe(401);
  });

  it("returns HMAC digests (never raw phone numbers) for verified registered managers only", async () => {
    queryQueue.push({
      data: [
        profileRow(), // verified real manager → digest present
        profileRow({
          id: "mgr-unverified",
          email: "unverified@landlord.com",
          phone: "4255550222",
          phone_verified_at: null, // unverified phone → no digest
        }),
        profileRow({
          id: "mgr-sandbox",
          email: "manager@test.axis.local", // sandbox → excluded from roster
          phone: "3605550333",
        }),
      ],
    });

    const res = await GET(
      new Request(ROUTE_URL, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");

    const body = (await res.json()) as { phoneHashes: string[] };
    console.log("manager-phones 200 body:", JSON.stringify(body));
    expect(body.phoneHashes).toEqual([
      expectedHash("+12065550111"),
      expectedHash("+15103098345"),
    ]);
    expect(body.phoneHashes).not.toContain(expectedHash("+14255550222"));
    expect(body.phoneHashes).not.toContain(expectedHash("+13605550333"));

    // No raw phone digits anywhere in the response body.
    const raw = JSON.stringify(body);
    for (const digits of ["2065550111", "4255550222", "3605550333"]) {
      expect(raw).not.toContain(digits);
    }
  });

  it("digest matches what the gateway computes for the same phone, so the bypass round-trips", async () => {
    queryQueue.push({ data: [profileRow()] });
    const res = await GET(
      new Request(ROUTE_URL, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    );
    const body = (await res.json()) as { phoneHashes: string[] };

    // Same normalization the gateway applies to an inbound frame's `from`.
    const gatewayDigits = "+1 (206) 555-0111".replace(/\D/g, "");
    const gatewayHash = createHmac("sha256", API_KEY).update(gatewayDigits).digest("hex");
    expect(body.phoneHashes).toContain(gatewayHash);
  });

  it("includes trial and ops forward phones in the manager debounce bypass", async () => {
    process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES = "+1 (425) 555-0444";
    queryQueue.push({ data: [] });

    const res = await GET(
      new Request(ROUTE_URL, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    );
    const body = (await res.json()) as { phoneHashes: string[] };

    expect(body.phoneHashes).toContain(expectedHash("+14255550444"));
    expect(body.phoneHashes).toContain(expectedHash("+15103098345"));
  });
});
