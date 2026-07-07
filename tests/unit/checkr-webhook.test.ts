import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["CHECKR_WEBHOOK_SECRET", "CHECKR_WEBHOOK_SECRET_TEST", "VERCEL"] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function signBody(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return { header: `t=${timestamp},v1=${v1}`, timestamp };
}

describe("checkr screening webhook", () => {
  beforeEach(() => {
    clearEnv();
    vi.resetModules();
  });
  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  it("accepts Checkr dashboard connectivity probes", async () => {
    process.env.VERCEL = "1";
    process.env.CHECKR_WEBHOOK_SECRET = "whsec_live";
    const { POST } = await import("@/app/api/webhooks/screening/checkr/route");
    const res = await POST(new Request("https://example.com/api/webhooks/screening/checkr", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, probe: true });
  });

  it("rejects signed payloads when secret is missing on Vercel", async () => {
    process.env.VERCEL = "1";
    const { POST } = await import("@/app/api/webhooks/screening/checkr/route");
    const body = JSON.stringify({ type: "report.completed", data: { order_id: "ord_1" } });
    const { header } = signBody(body, "whsec_live");
    const res = await POST(
      new Request("https://example.com/api/webhooks/screening/checkr", {
        method: "POST",
        body,
        headers: { "Tenant-Signature": header },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("verifies Tenant-Signature against live or test secrets", async () => {
    process.env.VERCEL = "1";
    process.env.CHECKR_WEBHOOK_SECRET = "whsec_live";
    process.env.CHECKR_WEBHOOK_SECRET_TEST = "whsec_test";

    vi.doMock("@/lib/checkr/client", () => ({
      fetchBackgroundCheckReport: vi.fn(async () => ({
        orderId: "ord_1",
        status: "complete",
        result: "clear",
        reportSnapshot: { creditScore: 715 },
      })),
    }));
    vi.doMock("@/lib/checkr/background-check", () => ({
      applyBackgroundCheckReport: vi.fn(async () => ({ id: "app_1" })),
    }));
    vi.doMock("@/lib/supabase/service", () => ({
      createSupabaseServiceRoleClient: vi.fn(() => ({})),
    }));

    const { POST } = await import("@/app/api/webhooks/screening/checkr/route");
    const body = JSON.stringify({
      id: "evt_1",
      type: "report.completed",
      data: { id: "rp_1", order_id: "ord_1" },
    });
    const { header } = signBody(body, "whsec_test");
    const res = await POST(
      new Request("https://example.com/api/webhooks/screening/checkr", {
        method: "POST",
        body,
        headers: { "Tenant-Signature": header, "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, applicationId: "app_1" });
  });
});
