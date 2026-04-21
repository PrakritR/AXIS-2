import { type DemoManagerPaymentLedgerRow, type ManagerPaymentBucket } from "@/data/demo-portal";
import { HOUSEHOLD_CHARGES_EVENT } from "@/lib/household-charges";
import { parseJsonArray, parseLocalStorageJson } from "@/lib/safe-local-storage";

const PAID_KEY = "axis_demo_manager_ledger_marked_paid_v1";
const DELETED_KEY = "axis_demo_manager_ledger_deleted_v1";
const CUSTOM_KEY = "axis_manager_payment_custom_lines_v1";

function emitChargesRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
}

function readPaidIds(): Set<string> {
  const arr = parseJsonArray<string>(parseLocalStorageJson(PAID_KEY));
  return new Set(arr.filter((id) => typeof id === "string"));
}

function writePaidIds(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAID_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function readDeletedIds(): Set<string> {
  const arr = parseJsonArray<string>(parseLocalStorageJson(DELETED_KEY));
  return new Set(arr.filter((id) => typeof id === "string"));
}

function writeDeletedIds(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELETED_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function readCustomPaymentLines(): DemoManagerPaymentLedgerRow[] {
  return parseJsonArray<DemoManagerPaymentLedgerRow>(parseLocalStorageJson(CUSTOM_KEY));
}

function writeCustom(lines: DemoManagerPaymentLedgerRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(lines));
  } catch {
    /* ignore */
  }
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
