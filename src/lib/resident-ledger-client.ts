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
 * Everything is keyed on the VIEWER identity. A module-global cache would
 * otherwise serve the previous resident's ledger after an in-session account
 * switch, and these rows render as money the account has paid.
 *
 * Coverage: `tests/unit/resident-ledger-client.test.ts`.
 */

/** How long a resident's ledger read is reused before another fetch is issued. */
export const RESIDENT_LEDGER_TTL_MS = 30_000;

type LedgerEntry = {
  refresher: CoalescedRefresher<ReportRow[]>;
  rows: ReportRow[] | null;
  fetchedAt: number;
};

const byIdentity = new Map<string, LedgerEntry>();

/** The cache/scoping key for a viewer. Empty when there is nobody to read for. */
export function residentLedgerIdentityKey(
  email: string | null | undefined,
  userId: string | null | undefined,
): string {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  return `${String(userId ?? "").trim()}|${normalizedEmail}`;
}

function entryFor(identity: string): LedgerEntry {
  const existing = byIdentity.get(identity);
  if (existing) return existing;
  const entry: LedgerEntry = {
    rows: null,
    fetchedAt: 0,
    refresher: undefined as unknown as CoalescedRefresher<ReportRow[]>,
  };
  entry.refresher = createCoalescedRefresher(async () => {
    const params = new URLSearchParams(residentLedgerReceiptRange());
    const res = await fetch(`/api/reports/resident-ledger?${params}`, { credentials: "include" });
    if (!res.ok) throw new Error(`resident-ledger responded ${res.status}`);
    const data = (await res.json()) as { rows?: ReportRow[] };
    const rows = Array.isArray(data.rows) ? data.rows : [];
    entry.rows = rows;
    entry.fetchedAt = Date.now();
    return rows;
  });
  byIdentity.set(identity, entry);
  return entry;
}

/**
 * The viewer's ledger rows, reusing a read newer than {@link RESIDENT_LEDGER_TTL_MS}
 * and joining any in-flight one. Rejects when the read fails, so a caller can
 * keep whatever it already had for THIS identity instead of showing nothing.
 */
export function loadResidentLedgerRows(identity: string): Promise<ReportRow[]> {
  if (!identity) return Promise.resolve([]);
  const entry = entryFor(identity);
  if (entry.rows && Date.now() - entry.fetchedAt < RESIDENT_LEDGER_TTL_MS) {
    return Promise.resolve(entry.rows);
  }
  return entry.refresher.run();
}

/** Test/debug hook: drops every cached identity. */
export function resetResidentLedgerCache(): void {
  byIdentity.clear();
}
