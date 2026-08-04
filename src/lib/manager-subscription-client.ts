/**
 * Client-side cache for GET /api/manager/subscription so Properties and other
 * tier-gated surfaces don't each pay for a cold fetch on first interaction.
 *
 * It caches `effectiveTier` — the plan the product actually holds the account
 * to — not the raw `manager_purchases.tier`. Every caller here is making an
 * entitlement decision (property cap, screening), and the raw column is `null`
 * for an account that simply never reached the pricing step, which read as
 * "uncapped" while Settings told the same manager they were on Free. The
 * server re-resolves the identical value, so a stale or tampered cache only
 * ever changes when the refusal is shown, never whether it holds.
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
      const body = (await res.json().catch(() => ({}))) as {
        tier?: string | null;
        effectiveTier?: string | null;
      };
      if (!res.ok) {
        cachedTier = null;
        return cachedTier;
      }
      cachedTier = body.effectiveTier ?? body.tier ?? null;
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
