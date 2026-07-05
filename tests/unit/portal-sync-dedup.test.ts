// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

// These loaders back sync-on-mount + polling call sites. They must collapse
// redundant calls into a single network request so remounts don't re-hit
// Supabase over PostgREST (the main egress source). See Phase 3 of the
// egress-reduction plan. Module-level guard state is reset per test via
// resetModules + dynamic import so tests are isolated.

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

async function freshServiceRequests() {
  vi.resetModules();
  return (await import("@/lib/service-requests-storage")).syncServiceRequestsFromServer;
}

async function freshLeaseUploads() {
  vi.resetModules();
  return (await import("@/lib/resident-lease-upload")).syncUploadedOwnLeasesFromServer;
}

describe("portal sync dedup guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mkStorage = () => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
      };
    };
    vi.stubGlobal("localStorage", mkStorage());
    vi.stubGlobal("sessionStorage", mkStorage());
  });

  it("syncServiceRequestsFromServer: TTL guard collapses repeat calls, force bypasses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rows: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const sync = await freshServiceRequests();

    await sync(); // first call hits network
    await sync(); // within TTL -> served locally, no fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await sync({ force: true }); // force -> network again
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("syncServiceRequestsFromServer: concurrent calls share one in-flight request", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const sync = await freshServiceRequests();

    const a = sync();
    const b = sync();
    resolveFetch(jsonResponse({ rows: [] }));
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("syncServiceRequestsFromServer: concurrent callers all get the fallback on network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const sync = await freshServiceRequests();

    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("syncUploadedOwnLeasesFromServer: concurrent callers all get the fallback on network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const sync = await freshLeaseUploads();

    const [a, b] = await Promise.all([sync("a@example.com"), sync("a@example.com")]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("syncUploadedOwnLeasesFromServer: TTL guard is per-email", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rows: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const sync = await freshLeaseUploads();

    await sync("a@example.com");
    await sync("a@example.com"); // within TTL -> no fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await sync("b@example.com"); // different key -> fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
