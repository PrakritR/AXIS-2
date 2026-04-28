import { type DemoManagerPaymentLedgerRow, type ManagerPaymentBucket } from "@/data/demo-portal";
import { HOUSEHOLD_CHARGES_EVENT } from "@/lib/household-charges";

let paidIds = new Set<string>();
let deletedIds = new Set<string>();
let customLines: DemoManagerPaymentLedgerRow[] = [];

function emitChargesRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
}

function readPaidIds(): Set<string> {
  return paidIds;
}

function writePaidIds(s: Set<string>) {
  paidIds = new Set(s);
}

function readDeletedIds(): Set<string> {
  return deletedIds;
}

function writeDeletedIds(s: Set<string>) {
  deletedIds = new Set(s);
}

function readCustomPaymentLines(): DemoManagerPaymentLedgerRow[] {
  return customLines;
}

function writeCustom(lines: DemoManagerPaymentLedgerRow[]) {
  customLines = lines;
}

function removePaidId(id: string) {
  const s = readPaidIds();
  if (!s.delete(id)) return;
  writePaidIds(s);
}

function applyPaidOverrides(rows: DemoManagerPaymentLedgerRow[]): DemoManagerPaymentLedgerRow[] {
  const paidIds = readPaidIds();
  return rows.map((r) => {
    if (!paidIds.has(r.id)) return r;
    return {
      ...r,
      bucket: "paid" as ManagerPaymentBucket,
      amountPaid: r.lineAmount,
      balanceDue: "$0.00",
      statusLabel: "Paid",
    };
  });
}

const BUILT_IN_STATIC: DemoManagerPaymentLedgerRow[] = [];

/** Payment lines from storage + custom lines, with paid overrides applied. */
export function mergeManagerPaymentLedger(staticRows: DemoManagerPaymentLedgerRow[] = BUILT_IN_STATIC): DemoManagerPaymentLedgerRow[] {
  const deleted = readDeletedIds();
  const filteredStatic = staticRows.filter((r) => !deleted.has(r.id));
  const custom = readCustomPaymentLines();
  return [...applyPaidOverrides(filteredStatic), ...applyPaidOverrides(custom)];
}

export function markManagerPaymentLedgerPaid(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = new Set(readPaidIds());
    next.add(id);
    writePaidIds(next);
    emitChargesRefresh();
  } catch {
    /* ignore */
  }
}

/** Removes a built-in static row id from view, or a custom line from storage. */
export function deleteManagerPaymentLedgerEntry(id: string): boolean {
  if (typeof window === "undefined") return false;

  const custom = readCustomPaymentLines();
  const ci = custom.findIndex((r) => r.id === id);
  if (ci !== -1) {
    writeCustom([...custom.slice(0, ci), ...custom.slice(ci + 1)]);
    removePaidId(id);
    emitChargesRefresh();
    return true;
  }

  if (BUILT_IN_STATIC.some((r) => r.id === id)) {
    const del = readDeletedIds();
    del.add(id);
    writeDeletedIds(del);
    removePaidId(id);
    emitChargesRefresh();
    return true;
  }

  return false;
}

export function addCustomManagerPaymentRow(row: DemoManagerPaymentLedgerRow): void {
  if (typeof window === "undefined") return;
  try {
    const next = [...readCustomPaymentLines(), row];
    writeCustom(next);
    emitChargesRefresh();
  } catch {
    /* ignore */
  }
}
