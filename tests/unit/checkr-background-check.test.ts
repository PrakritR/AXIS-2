import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";

const ENV_KEYS = [
  "CHECKR_API_KEY",
  "BACKGROUND_CHECK_API_KEY",
  "CHECKR_PACKAGE",
  "CHECKR_API_BASE_URL",
  "CHECKR_SIMULATE",
] as const;

const PROPERTY = { name: "The Pioneer", street: "123 Main St", city: "Seattle", state: "WA", zipcode: "98101" };

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("checkr background check", () => {
  beforeEach(() => {
    clearEnv();
    vi.resetModules();
  });
  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  it("maps report state onto the manager-facing badge", async () => {
    const { backgroundCheckStatusFromCheckr } = await import("@/lib/checkr/background-check");
    const base: ApplicationBackgroundCheck = {
      provider: "checkr",
      candidateId: "c",
      reportId: "r",
      packageSlug: "essential",
      status: "pending",
      result: null,
      orderedAt: "2026-07-02T00:00:00.000Z",
    };
    expect(backgroundCheckStatusFromCheckr(undefined)).toBe("pending_review");
    expect(backgroundCheckStatusFromCheckr(base)).toBe("pending_review");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "complete", result: "clear" })).toBe("passed");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "complete", result: "consider" })).toBe("flagged");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "canceled" })).toBe("pending_review");
  });

  it("simulate mode returns deterministic clear/consider from SSN parity", async () => {
    process.env.CHECKR_SIMULATE = "1";
    process.env.CHECKR_PACKAGE = "essential";
    const { createBackgroundCheck, fetchBackgroundCheckReport } = await import("@/lib/checkr/client");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const created = await createBackgroundCheck(
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        dob: "1990-01-01",
        ssn: "111-22-3334", // ends in 4 → clear
      },
      PROPERTY,
    );
    expect(created.status).toBe("pending");
    expect(created.simulated).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const clear = await fetchBackgroundCheckReport(created.orderId, { ssn: "111223334" });
    expect(clear?.status).toBe("complete");
    expect(clear?.result).toBe("clear");

    const consider = await fetchBackgroundCheckReport("test_order_x", { ssn: "111223335" });
    expect(consider?.result).toBe("consider");
  });

  it("live mode uses Bearer auth and the applicant→property→order flow", async () => {
    process.env.CHECKR_API_KEY = "ckr_sk_test_abc123";
    process.env.CHECKR_PACKAGE = "essential";
    const { createBackgroundCheck } = await import("@/lib/checkr/client");

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/applicants")) {
        return new Response(JSON.stringify({ id: "ap_1" }), { status: 201 });
      }
      if (url.endsWith("/properties")) {
        return new Response(JSON.stringify({ id: "pr_1" }), { status: 201 });
      }
      if (url.endsWith("/orders")) {
        return new Response(JSON.stringify({ id: "ord_1", status: "pending" }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createBackgroundCheck(
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        dob: "1990-01-01",
        ssn: "111223334",
      },
      PROPERTY,
    );

    expect(created.applicantId).toBe("ap_1");
    expect(created.orderId).toBe("ord_1");
    expect(created.status).toBe("pending");

    const applicantCall = calls.find((c) => c.url.endsWith("/applicants"))!;
    expect(applicantCall.url).toBe("https://tenant.checkr.com/api/applicants");
    const auth = (applicantCall.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer ckr_sk_test_abc123");
    const orderCall = calls.find((c) => c.url.endsWith("/orders"))!;
    expect(JSON.parse(orderCall.init!.body as string)).toMatchObject({
      order: { applicant_id: "ap_1", property_id: "pr_1", package: "essential" },
    });
  });

  it("surfaces Checkr errors without leaking the key", async () => {
    process.env.CHECKR_API_KEY = "ckr_sk_test_secret";
    process.env.CHECKR_PACKAGE = "essential";
    const { createBackgroundCheck } = await import("@/lib/checkr/client");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ errors: [{ detail: "invalid ssn" }] }), { status: 400 })),
    );
    await expect(
      createBackgroundCheck(
        { firstName: "Jane", lastName: "Doe", email: "jane@example.com", dob: "1990-01-01", ssn: "bad" },
        PROPERTY,
      ),
    ).rejects.toThrow(/invalid ssn/);
    await expect(
      createBackgroundCheck(
        { firstName: "Jane", lastName: "Doe", email: "jane@example.com", dob: "1990-01-01", ssn: "bad" },
        PROPERTY,
      ),
    ).rejects.not.toThrow(/ckr_sk_test_secret/);
  });
});
