/**
 * Client-side cache for GET /api/manager/subscription so Properties and other
 * tier-gated surfaces don't each pay for a cold fetch on first interaction.
 */

let cachedTier: string | null | undefined;
let inflight: Promise<string | null> | null = null;

export function readManagerSubscriptionTierClient(): string | null | undefined {
  return cachedTier;
}

export function loadManagerSubscriptionTierClient(): Promise<string | null> {
  if (cachedTier !== undefined) return Promise.resolve(cachedTier);
  if (inflight) return inflight;
  inflight = fetch("/api/manager/subscription", { credentials: "include" })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { tier?: string | null };
      if (!res.ok) {
        cachedTier = null;
        return cachedTier;
      }
      cachedTier = body.tier ?? null;
      return cachedTier;
    })
    .catch(() => {
      cachedTier = null;
      return cachedTier;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test / sign-out hooks may clear the cache. */
export function resetManagerSubscriptionTierClientCache() {
  cachedTier = undefined;
  inflight = null;
}
