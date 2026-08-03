// Pins the document-expiry loader's TTL + coalescing behaviour, and the reason
// it is keyed per user: these counts belong to ONE manager, so an in-session
// account switch must never be served the previous manager's numbers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDocumentExpirationSummary,
  resetDocumentExpirationSummaryCache,
} from "@/lib/manager-document-expiry-client";

type Summary = { expired: number; within30: number; within60: number; within90: number };

function summaryFor(expired: number): Summary {
  return { expired, within30: 0, within60: 0, within90: 0 };
}

const originalFetch = globalThis.fetch;

function mockFetch(sequence: Summary[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const summary = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    return { ok: true, json: async () => ({ summary }) } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => resetDocumentExpirationSummaryCache());

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("loadDocumentExpirationSummary", () => {
  it("serves a cached summary inside the TTL instead of refetching", async () => {
    const fetchMock = mockFetch([summaryFor(3)]);

    const first = await loadDocumentExpirationSummary({ userId: "mgr-1" });
    const second = await loadDocumentExpirationSummary({ userId: "mgr-1" });

    expect(first).toEqual(summaryFor(3));
    expect(second).toEqual(summaryFor(3));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of concurrent unforced loads into one request", async () => {
    const fetchMock = mockFetch([summaryFor(1)]);

    const results = await Promise.all([
      loadDocumentExpirationSummary({ userId: "mgr-1" }),
      loadDocumentExpirationSummary({ userId: "mgr-1" }),
      loadDocumentExpirationSummary({ userId: "mgr-1" }),
    ]);

    expect(results.every((r) => r?.expired === 1)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when forced, bypassing the TTL", async () => {
    const fetchMock = mockFetch([summaryFor(1), summaryFor(7)]);

    await loadDocumentExpirationSummary({ userId: "mgr-1" });
    const forced = await loadDocumentExpirationSummary({ userId: "mgr-1", force: true });

    expect(forced).toEqual(summaryFor(7));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NEVER serves one manager's counts to another — the cache is per user", async () => {
    const fetchMock = mockFetch([summaryFor(5), summaryFor(0)]);

    const first = await loadDocumentExpirationSummary({ userId: "mgr-1" });
    // Same tick, well inside the TTL: a module-global cache would hand mgr-2
    // mgr-1's numbers here.
    const second = await loadDocumentExpirationSummary({ userId: "mgr-2" });

    expect(first).toEqual(summaryFor(5));
    expect(second).toEqual(summaryFor(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good summary when a refresh fails", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, json: async () => ({ summary: summaryFor(2) }) } as unknown as Response;
      }
      return { ok: false, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    await loadDocumentExpirationSummary({ userId: "mgr-1" });
    const afterFailure = await loadDocumentExpirationSummary({ userId: "mgr-1", force: true });

    expect(afterFailure).toEqual(summaryFor(2));
  });
});
