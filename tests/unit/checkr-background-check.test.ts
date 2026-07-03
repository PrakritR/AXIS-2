import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";

const ENV_KEYS = [
  "CHECKR_API_KEY",
  "BACKGROUND_CHECK_API_KEY",
  "CHECKR_PACKAGE",
  "CHECKR_API_BASE_URL",
  "CHECKR_SIMULATE",
] as const;

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
      packageSlug: "p",
      status: "pending",
      result: null,
      orderedAt: "2026-07-02T00:00:00.000Z",
    };
    expect(backgroundCheckStatusFromCheckr(undefined)).toBe("pending_review");
    expect(backgroundCheckStatusFromCheckr(base)).toBe("pending_review");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "complete", result: "clear" })).toBe("passed");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "complete", result: "consider" })).toBe("flagged");
    expect(backgroundCheckStatusFromCheckr({ ...base, status: "suspended" })).toBe("pending_review");
  });

  it("simulate mode returns deterministic clear/consider from SSN parity", async () => {
    process.env.CHECKR_SIMULATE = "1";
    process.env.CHECKR_PACKAGE = "test_pro_criminal";
    const { createBackgroundCheck, fetchBackgroundCheckReport } = await import("@/lib/checkr/client");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const created = await createBackgroundCheck({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      dob: "1990-01-01",
      ssn: "111-22-3334", // ends in 4 → clear
      zipcode: "98101",
    });
    expect(created.status).toBe("pending");
    expect(created.simulated).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const clear = await fetchBackgroundCheckReport(created.reportId, { ssn: "111223334" });
    expect(clear?.status).toBe("complete");
    expect(clear?.result).toBe("clear");

    const consider = await fetchBackgroundCheckReport("test_rpt_x", { ssn: "111223335" });
    expect(consider?.result).toBe("consider");
  });

  it("live mode uses Basic auth and the two-step candidate→report flow", async () => {
    process.env.CHECKR_API_KEY = "ckr_sk_test_abc123";
    process.env.CHECKR_PACKAGE = "test_pro_criminal";
    const { createBackgroundCheck } = await import("@/lib/checkr/client");

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/candidates")) {
        return new Response(JSON.stringify({ id: "cand_1" }), { status: 201 });
      }
      if (url.endsWith("/reports")) {
        return new Response(JSON.stringify({ id: "rep_1", status: "pending", result: null }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createBackgroundCheck({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      dob: "1990-01-01",
      ssn: "111223334",
      zipcode: "98101",
    });

    expect(created.candidateId).toBe("cand_1");
    expect(created.reportId).toBe("rep_1");
    expect(created.status).toBe("pending");

    // Test key → staging host, Basic auth, report package forwarded.
    const candidateCall = calls.find((c) => c.url.endsWith("/candidates"))!;
    expect(candidateCall.url).toBe("https://api.checkr-staging.com/v1/candidates");
    const auth = (candidateCall.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("ckr_sk_test_abc123:").toString("base64")}`);
    const reportCall = calls.find((c) => c.url.endsWith("/reports"))!;
    expect(JSON.parse(reportCall.init!.body as string)).toMatchObject({
      candidate_id: "cand_1",
      package: "test_pro_criminal",
    });
  });

  it("surfaces Checkr errors without leaking the key", async () => {
    process.env.CHECKR_API_KEY = "ckr_sk_test_secret";
    process.env.CHECKR_PACKAGE = "test_pro_criminal";
    const { createBackgroundCheck } = await import("@/lib/checkr/client");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid ssn" }), { status: 400 })),
    );
    await expect(
      createBackgroundCheck({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        dob: "1990-01-01",
        ssn: "bad",
        zipcode: "98101",
      }),
    ).rejects.toThrow(/invalid ssn/);
    await expect(
      createBackgroundCheck({
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        dob: "1990-01-01",
        ssn: "bad",
        zipcode: "98101",
      }),
    ).rejects.not.toThrow(/ckr_sk_test_secret/);
  });
});
