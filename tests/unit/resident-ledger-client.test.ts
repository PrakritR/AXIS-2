import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadResidentLedgerRows,
  residentLedgerIdentityKey,
  resetResidentLedgerCache,
} from "@/lib/resident-ledger-client";

/**
 * The resident ledger is a 12-month `ledger_entries` scan whose callers refetch
 * on every charge event, so it must coalesce and respect a TTL ("Performance &
 * egress" in AGENTS.md) — and the cache must be keyed on the viewer, or an
 * in-session account switch serves the previous resident's money.
 */

function jsonResponse(rows: unknown[]) {
  return { ok: true, json: async () => ({ rows }) } as unknown as Response;
}

beforeEach(() => {
  resetResidentLedgerCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetResidentLedgerCache();
});

describe("residentLedgerIdentityKey", () => {
  it("normalizes the email and carries the user id", () => {
    expect(residentLedgerIdentityKey(" Maya@Example.com ", "u-1")).toBe("u-1|maya@example.com");
    expect(residentLedgerIdentityKey("maya@example.com", null)).toBe("|maya@example.com");
  });

  it("is empty when there is nobody to read for", () => {
    expect(residentLedgerIdentityKey("", "u-1")).toBe("");
    expect(residentLedgerIdentityKey(null, null)).toBe("");
  });
});

describe("loadResidentLedgerRows", () => {
  it("coalesces concurrent reads into one request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ payment: "$100.00" }]));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b, c] = await Promise.all([
      loadResidentLedgerRows("u-1|maya@example.com"),
      loadResidentLedgerRows("u-1|maya@example.com"),
      loadResidentLedgerRows("u-1|maya@example.com"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual([{ payment: "$100.00" }]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("reuses a fresh read instead of refetching on every charge event", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ payment: "$100.00" }]));
    vi.stubGlobal("fetch", fetchMock);

    await loadResidentLedgerRows("u-1|maya@example.com");
    await loadResidentLedgerRows("u-1|maya@example.com");
    await loadResidentLedgerRows("u-1|maya@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never serves one resident's rows to another", async () => {
    const fetchMock = vi.fn(async () => {
      const call = fetchMock.mock.calls.length;
      return jsonResponse([{ payment: `$${call}00.00` }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const maya = await loadResidentLedgerRows("u-1|maya@example.com");
    const sam = await loadResidentLedgerRows("u-2|sam@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sam).not.toEqual(maya);
  });

  it("rejects a failed read rather than caching an empty ledger", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadResidentLedgerRows("u-1|maya@example.com")).rejects.toThrow(/403/);
  });

  it("reads nothing at all without an identity", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadResidentLedgerRows("")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
