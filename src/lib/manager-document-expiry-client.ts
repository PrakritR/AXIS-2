/**
 * Client loader for the manager dashboard's document-expiry counts.
 *
 * The dashboard fires this from an effect keyed on its generic `tick` counter,
 * which is bumped by ~10 unrelated store events (inbox, work orders, service
 * requests, charges, leases, applications…). During first paint those loaders
 * all land within a second of each other, so the banner's counts were refetched
 * once per bump — measured at 6 identical `/api/manager-documents/expiration-summary`
 * requests on a single `/portal/dashboard` load.
 *
 * This wraps the fetch in the same TTL + coalescing guard the other portal sync
 * helpers use, so a burst of bumps costs one request while a genuinely later
 * change still refetches. Coverage: `tests/unit/manager-document-expiry-client.test.ts`.
 */
import { createCoalescedRefresher } from "@/lib/coalesced-refresh";

export type DocumentExpirationSummaryShape = {
  expired: number;
  expiringSoon: number;
};

const EXPIRY_SUMMARY_TTL_MS = 15_000;

let cached: unknown = null;
let lastLoadedAt = 0;

const refresher = createCoalescedRefresher(async () => {
  const res = await fetch("/api/manager-documents/expiration-summary", { credentials: "include" });
  if (!res.ok) return cached;
  const body = (await res.json()) as { summary?: unknown };
  if (body?.summary) {
    cached = body.summary;
    lastLoadedAt = Date.now();
  }
  return cached;
});

/**
 * Returns the summary, reusing a cached one inside the TTL. Pass `force` after a
 * document write to guarantee a read newer than the write.
 */
export async function loadDocumentExpirationSummary(opts?: { force?: boolean }): Promise<unknown> {
  const force = opts?.force === true;
  if (!force && lastLoadedAt > 0 && Date.now() - lastLoadedAt < EXPIRY_SUMMARY_TTL_MS) {
    return cached;
  }
  return refresher.run(force);
}

/** Test hook: clears the cache so each case starts cold. */
export function resetDocumentExpirationSummaryCache(): void {
  cached = null;
  lastLoadedAt = 0;
  refresher.reset();
}
