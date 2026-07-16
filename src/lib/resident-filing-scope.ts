/**
 * Pure helpers for choosing which manager/property a resident filing should
 * stamp when they have multiple application rows (common in the sandbox:
 * resident@test is approved under both manager@test's `mgr-demo-*` portfolio
 * and testeveything's guided `mgr-te-demo-*` mirror).
 */

export type FilingScopeCandidate = {
  managerUserId: string;
  propertyId: string;
  approved: boolean;
  /** ISO timestamp — older wins within the same priority tier. */
  updatedAt?: string | null;
};

/**
 * Lower is better. Canonical demo portfolio (`mgr-demo-*`) outranks guided
 * tour mirrors (`mgr-te-demo-*`) so sandbox residents file into Demo Manager's
 * queue instead of the Everything Test duplicate.
 */
export function filingPropertyPriority(propertyId: string): number {
  const id = propertyId.trim().toLowerCase();
  if (!id) return 200;
  if (id.startsWith("mgr-demo-")) return 0;
  if (id.startsWith("mgr-te-demo-") || id.includes("-te-demo-")) return 100;
  return 50;
}

/**
 * Pick the primary filing target among residency candidates.
 *
 * 1. Prefer approved over pending/other buckets.
 * 2. Within that set, prefer the best property-id priority tier.
 * 3. Honor a client claim only when it lands in that top tier.
 * 4. Otherwise take the oldest row in the top tier (seed-stable).
 */
export function pickPrimaryFilingScope(
  candidates: FilingScopeCandidate[],
  claimed?: { managerUserId?: string | null; propertyId?: string | null },
): FilingScopeCandidate | null {
  if (candidates.length === 0) return null;

  const approved = candidates.filter((c) => c.approved);
  const pool = approved.length > 0 ? approved : candidates;
  const bestPriority = Math.min(...pool.map((c) => filingPropertyPriority(c.propertyId)));
  const topTier = pool
    .filter((c) => filingPropertyPriority(c.propertyId) === bestPriority)
    .slice()
    .sort((a, b) => String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? "")));

  if (topTier.length === 0) return null;

  const claimedManager = claimed?.managerUserId?.trim() || "";
  const claimedProperty = claimed?.propertyId?.trim() || "";

  if (claimedManager || claimedProperty) {
    const propertyMatch = topTier.find((c) => {
      if (claimedProperty && c.propertyId !== claimedProperty) return false;
      if (claimedManager && c.managerUserId !== claimedManager) return false;
      return Boolean(claimedProperty || claimedManager);
    });
    if (propertyMatch) return propertyMatch;

    if (claimedManager) {
      const managerMatch = topTier.find((c) => c.managerUserId === claimedManager);
      if (managerMatch) return managerMatch;
    }
  }

  return topTier[0] ?? null;
}
