import type { HouseholdCharge } from "@/lib/household-charges";
import type { ReportRow } from "@/lib/reports/types";

/**
 * WHY THIS MODULE EXISTS
 *
 * A resident has TWO money surfaces that answer "what have I paid":
 *  - Documents › Rent receipts, built from `ledger_entries` (the accounting
 *    record — every payment ever posted for this resident), and
 *  - Payments › Paid, built from `portal_household_charge_records` (the live
 *    charge list).
 *
 * They disagreed by construction. A charge that is deleted, superseded, or
 * dropped in a data reset leaves its ledger payment behind, so Documents listed
 * eleven receipts while Payments reported "Paid 0" for the same account
 * (resident audit F6). Neither surface said anything was missing.
 *
 * The ledger is the record of payments, so Paid is reconciled UP to it: any
 * recorded payment with no surviving charge row becomes a read-only paid row.
 * Nothing is deleted from either store, and no payable state is invented — the
 * synthesized rows are always `status: "paid"`, so every pay/select path (which
 * filters on `pending`) ignores them.
 *
 * Coverage: `tests/unit/resident-recorded-payments.test.ts`.
 */

/**
 * Default resident-ledger window (trailing 12 months). Documents › Rent
 * receipts and Payments › Paid MUST read the same window, or the two counts
 * disagree again for a different reason.
 */
export function residentLedgerReceiptRange(now = new Date()): { from: string; to: string } {
  // Formatted from LOCAL components at both ends. Building `from` locally and
  // then serializing with `toISOString()` mixed calendars: east of UTC the
  // window opened a day early and could exclude a payment posted today, so a
  // receipt could be missing from both surfaces at once. `ledger_entries.posted_date`
  // is a plain date, so a local calendar date is the right key.
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from: localDateKey(from), to: localDateKey(now) };
}

/**
 * A plain `ledger_entries.posted_date` ("2026-03-01") as the label the live
 * charge list prints ("Mar 1, 2026").
 *
 * Two things depend on it. The Paid tab's Due column shows synthesized rows
 * next to live paid charges, so a raw ISO string puts two date formats in one
 * money column. And `parseDueDateLabelToDate` feeds sorting: `new Date(...)`
 * reads a bare `YYYY-MM-DD` as UTC midnight and then the local components are
 * taken off it, which sorts the row under the previous day west of UTC. The
 * components are parsed here instead, so the date is a local calendar date at
 * both ends.
 */
export function formatLedgerDateLabel(plainDate: string | null | undefined): string {
  const raw = String(plainDate ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function localDateKey(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Prefix `syncLedgerPaymentEntry` puts on every payment entry description. */
const LEDGER_PAYMENT_DESCRIPTION_PREFIX = /^payment\s*[—–-]\s*/i;

/** Id prefix marking a paid row reconstructed from the ledger rather than a live charge. */
export const RECORDED_PAYMENT_ID_PREFIX = "recorded-payment:";

export function isRecordedPaymentRow(charge: Pick<HouseholdCharge, "id">): boolean {
  return charge.id.startsWith(RECORDED_PAYMENT_ID_PREFIX);
}

/**
 * What was actually paid, from a ledger payment description.
 * `"Payment — Utilities — July 2026"` → `"Utilities — July 2026"`.
 *
 * Documents used to hardcode every row's name to "Rent receipt", so utilities,
 * deposits and application fees all read as rent on an exportable financial
 * record (resident audit U9). The description already carries the truth.
 */
export function recordedPaymentTitle(description: string | null | undefined): string {
  const trimmed = String(description ?? "").trim();
  if (!trimmed) return "Payment";
  const stripped = trimmed.replace(LEDGER_PAYMENT_DESCRIPTION_PREFIX, "").trim();
  return stripped || "Payment";
}

/** Row label for Documents › Rent receipts — names the charge, never assumes rent. */
export function receiptRowLabel(description: string | null | undefined): string {
  return `Receipt · ${recordedPaymentTitle(description)}`;
}

function moneyLabel(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "$0.00";
  return text.startsWith("$") ? text : `$${text}`;
}

function readString(row: ReportRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

/** A `payment` row from the resident-ledger report. */
export function isLedgerPaymentRow(row: ReportRow): boolean {
  return typeof row.payment === "string" && row.payment.trim() !== "";
}

/**
 * Paid rows for payments the ledger recorded but the charge store no longer
 * holds. Matched on `sourceChargeId`, the id the ledger entry was written
 * under, so a payment whose charge still exists is never duplicated.
 */
export function recordedPaymentsMissingFromCharges(
  ledgerRows: ReadonlyArray<ReportRow>,
  charges: ReadonlyArray<HouseholdCharge>,
): HouseholdCharge[] {
  const knownChargeIds = new Set(charges.map((c) => c.id));
  const seenSourceIds = new Set<string>();
  const contentOccurrences = new Map<string, number>();
  const out: HouseholdCharge[] = [];

  for (const row of ledgerRows) {
    if (!isLedgerPaymentRow(row)) continue;
    const sourceChargeId = readString(row, "sourceChargeId");
    if (sourceChargeId && knownChargeIds.has(sourceChargeId)) continue;

    const paidDate = readString(row, "date");
    const description = readString(row, "description");
    const amount = moneyLabel(row.payment);
    const title = recordedPaymentTitle(description);

    let key: string;
    if (sourceChargeId) {
      if (seenSourceIds.has(sourceChargeId)) continue;
      seenSourceIds.add(sourceChargeId);
      key = sourceChargeId;
    } else {
      // No source id means the entry predates source tracking. Key it on the
      // payment's own content plus an occurrence counter, so the id is the same
      // on every load while two genuinely identical payments stay distinct.
      const contentKey = `${paidDate}|${amount}|${description}`;
      const seen = contentOccurrences.get(contentKey) ?? 0;
      contentOccurrences.set(contentKey, seen + 1);
      key = `${contentKey}#${seen}`;
    }

    out.push({
      id: `${RECORDED_PAYMENT_ID_PREFIX}${key}`,
      residentName: "",
      residentEmail: "",
      residentUserId: null,
      managerUserId: null,
      propertyId: "",
      propertyLabel: readString(row, "property"),
      kind: "other_cost",
      title,
      amountLabel: amount,
      balanceLabel: "$0.00",
      status: "paid",
      blocksLeaseUntilPaid: false,
      createdAt: paidDate,
      paidAt: paidDate,
      dueDateLabel: formatLedgerDateLabel(paidDate),
    });
  }

  return out;
}
