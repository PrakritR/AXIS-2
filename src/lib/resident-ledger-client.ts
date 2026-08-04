import { createCoalescedRefresher, type CoalescedRefresher } from "@/lib/coalesced-refresh";
import type { ReportRow } from "@/lib/reports/types";
import { residentLedgerReceiptRange } from "@/lib/resident-recorded-payments";

/**
 * Client loader for the resident ledger (`/api/reports/resident-ledger`), the
 * accounting source Payments › Paid reconciles against.
 *
 * The request is a 12-month `ledger_entries` scan, and its callers refetch on
 * every charge event, so it goes through the shared TTL + in-flight guard
 * pattern (`createCoalescedRefresher`) rather than fetching unconditionally —
 * see "Performance & egress" in AGENTS.md.
 *
 * The cache key carries BOTH the viewer identity and the requested window. The
 * identity, because a module-global cache would otherwise serve the previous
 * resident's ledger after an in-session account switch, and these rows render as
 * money the account has paid. The window, because Documents › Rent receipts lets
 * the resident pick their own date range: keyed on identity alone, that surface
 * would be handed another window's rows for the whole TTL and silently show the
 * wrong receipts for the dates it is displaying.
 *
 * Coverage: `tests/unit/resident-ledger-client.test.ts`.
 */

/** How long a resident's ledger read is reused before another fetch is issued. */
export const RESIDENT_LEDGER_TTL_MS = 30_000;

export type ResidentLedgerRange = { from: string; to: string };

type LedgerEntry = {
  refresher: CoalescedRefresher<ReportRow[]>;
  rows: ReportRow[] | null;
  fetchedAt: number;
};

const byKey = new Map<string, LedgerEntry>();

/** The viewer half of the cache key. Empty when there is nobody to read for. */
export function residentLedgerIdentityKey(
  email: string | null | undefined,
  userId: string | null | undefined,
): string {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  return `${String(userId ?? "").trim()}|${normalizedEmail}`;
}

function cacheKey(identity: string, range: ResidentLedgerRange): string {
  return `${identity}@${range.from}..${range.to}`;
}

function entryFor(identity: string, range: ResidentLedgerRange): LedgerEntry {
  const key = cacheKey(identity, range);
  const existing = byKey.get(key);
  if (existing) return existing;
  const entry: LedgerEntry = {
    rows: null,
    fetchedAt: 0,
    refresher: undefined as unknown as CoalescedRefresher<ReportRow[]>,
  };
  entry.refresher = createCoalescedRefresher(async () => {
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const res = await fetch(`/api/reports/resident-ledger?${params}`, { credentials: "include" });
    if (!res.ok) throw new Error(`resident-ledger responded ${res.status}`);
    const data = (await res.json()) as { rows?: ReportRow[] };
    const rows = Array.isArray(data.rows) ? data.rows : [];
    entry.rows = rows;
    entry.fetchedAt = Date.now();
    return rows;
  });
  byKey.set(key, entry);
  return entry;
}

/**
 * The viewer's ledger rows for `range` (default: the trailing 12 months
 * Payments › Paid and Documents › Rent receipts share), reusing a read newer
 * than {@link RESIDENT_LEDGER_TTL_MS} and joining any in-flight one. Rejects
 * when the read fails, so a caller can keep whatever it already had for THIS
 * identity and window instead of showing nothing.
 */
export function loadResidentLedgerRows(
  identity: string,
  range: ResidentLedgerRange = residentLedgerReceiptRange(),
): Promise<ReportRow[]> {
  if (!identity) return Promise.resolve([]);
  const entry = entryFor(identity, range);
  if (entry.rows && Date.now() - entry.fetchedAt < RESIDENT_LEDGER_TTL_MS) {
    return Promise.resolve(entry.rows);
  }
  return entry.refresher.run();
}

/** Test/debug hook: drops every cached identity and window. */
export function resetResidentLedgerCache(): void {
  byKey.clear();
}
