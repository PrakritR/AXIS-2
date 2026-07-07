import type { DemoManagerOutgoingPaymentRow, DemoManagerWorkOrderRow, ManagerPaymentBucket } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { demoExpenseRows } from "@/lib/demo/demo-data";
import type { HouseholdCharge } from "@/lib/household-charges";
import { enrichOutgoingRowWithVendorPayments, managerVendorPayMethodLabel } from "@/lib/manager-vendor-payment-flow";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { readManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";
import { parseMoneyAmount } from "@/lib/parse-money";
import { residentConnectApplicationFeeCents } from "@/lib/payment-policy";
import { safeFormatDateTime } from "@/lib/pacific-time";

export type ManagerExpenseSnapshot = {
  id: string;
  propertyId?: string | null;
  propertyName?: string | null;
  categoryCode: string;
  categoryLabel: string;
  amountCents: number;
  expenseDate: string;
  memo?: string | null;
  vendorId?: string | null;
  sourceWorkOrderId?: string | null;
};

export const MANAGER_OUTGOING_PAYMENTS_EVENT = "axis:manager-outgoing-payments";
const SESSION_KEY = "axis:manager-outgoing-expenses:v1";
const DELETED_DEMO_EXPENSES_KEY = "axis:manager-outgoing-expenses-deleted:v1";
const SYNC_TTL_MS = 15_000;

let memoryExpenses: ManagerExpenseSnapshot[] = [];
let lastSyncedAt = 0;
let syncPromise: Promise<ManagerExpenseSnapshot[]> | null = null;

function canUseStorage() {
  return typeof window !== "undefined";
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseCents(label: string): number {
  const parsed = parseMoneyAmount(label);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function dueDateLabelFromIso(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function workOrderAmountCents(row: DemoManagerWorkOrderRow): number {
  const labor = row.vendorCostCents ?? 0;
  const materials = row.materialsCostCents ?? 0;
  if (labor + materials > 0) return labor + materials;
  return parseCents(row.cost ?? "");
}

function workOrderBucket(row: DemoManagerWorkOrderRow): ManagerPaymentBucket | null {
  if (row.automationStatus === "paid") return "paid";
  if (row.automationStatus !== "vendor_marked_done") return null;
  const markedAt = row.vendorMarkedDoneAt ? new Date(row.vendorMarkedDoneAt).getTime() : NaN;
  if (Number.isFinite(markedAt) && Date.now() - markedAt > 3 * 86_400_000) return "overdue";
  return "pending";
}

function workOrderStatusLabel(bucket: ManagerPaymentBucket): string {
  if (bucket === "paid") return "Paid";
  if (bucket === "overdue") return "Overdue";
  return "Awaiting approval";
}

function hydrateFromSession() {
  if (!canUseStorage() || memoryExpenses.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    memoryExpenses = JSON.parse(raw) as ManagerExpenseSnapshot[];
  } catch {
    memoryExpenses = [];
  }
}

function writeSession(expenses: ManagerExpenseSnapshot[]) {
  memoryExpenses = expenses;
  if (canUseStorage()) {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(expenses));
  }
  if (canUseStorage()) {
    window.dispatchEvent(new Event(MANAGER_OUTGOING_PAYMENTS_EVENT));
  }
}

function readDeletedDemoExpenseIds(): Set<string> {
  if (!canUseStorage()) return new Set();
  try {
    const raw = window.sessionStorage.getItem(DELETED_DEMO_EXPENSES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDeletedDemoExpenseIds(ids: Set<string>) {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(DELETED_DEMO_EXPENSES_KEY, JSON.stringify([...ids]));
}

function mapDemoExpenseRows(): ManagerExpenseSnapshot[] {
  const deleted = readDeletedDemoExpenseIds();
  return demoExpenseRows()
    .filter((row) => !deleted.has(row.id))
    .map((row) => ({
      id: row.id,
      propertyId: null,
      propertyName: row.property,
      categoryCode: "other_expense",
      categoryLabel: row.category,
      amountCents: parseCents(row.amount),
      expenseDate: row.date,
      memo: row.memo,
      vendorId: null,
    }));
}

export function deleteManagerOutgoingExpense(expenseId: string): boolean {
  const id = expenseId.trim();
  if (!id) return false;
  hydrateFromSession();

  const hadLocal = memoryExpenses.some((expense) => expense.id === id);
  if (hadLocal) {
    writeSession(memoryExpenses.filter((expense) => expense.id !== id));
  }

  if (isDemoModeActive()) {
    const deleted = readDeletedDemoExpenseIds();
    const isBuiltInDemo = demoExpenseRows().some((row) => row.id === id);
    if (!hadLocal && !isBuiltInDemo) return false;
    deleted.add(id);
    writeDeletedDemoExpenseIds(deleted);
    if (!hadLocal) {
      writeSession(mapDemoExpenseRows());
    }
    return true;
  }

  return hadLocal;
}

export function readManagerOutgoingExpenses(): ManagerExpenseSnapshot[] {
  hydrateFromSession();
  return [...memoryExpenses];
}

export async function syncManagerOutgoingExpensesFromServer(force = false): Promise<ManagerExpenseSnapshot[]> {
  hydrateFromSession();
  if (isDemoModeActive()) {
    const demo = mapDemoExpenseRows();
    writeSession(demo);
    return demo;
  }

  if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < SYNC_TTL_MS) {
    return readManagerOutgoingExpenses();
  }

  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const res = await fetch("/api/expenses", { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as { expenses?: ManagerExpenseSnapshot[] };
      if (!res.ok) return readManagerOutgoingExpenses();
      const expenses = data.expenses ?? [];
      writeSession(expenses);
      lastSyncedAt = Date.now();
      return expenses;
    } catch {
      return readManagerOutgoingExpenses();
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export function buildManagerOutgoingPaymentRows(input: {
  managerUserId: string | null;
  expenses: ManagerExpenseSnapshot[];
  workOrders?: DemoManagerWorkOrderRow[];
  paidCharges?: HouseholdCharge[];
  propertyLabelById?: Map<string, string>;
  vendorNameById?: Map<string, string>;
  vendorById?: Map<string, ManagerVendorRow>;
}): DemoManagerOutgoingPaymentRow[] {
  const rows: DemoManagerOutgoingPaymentRow[] = [];
  const propertyLabelById = input.propertyLabelById ?? new Map<string, string>();
  const vendorNameById = input.vendorNameById ?? new Map<string, string>();
  const vendorById = input.vendorById ?? new Map<string, ManagerVendorRow>();
  const workOrders = input.workOrders ?? readManagerWorkOrderRows();
  const paidCharges = input.paidCharges ?? [];
  const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));
  const workOrderExpenseIds = new Set(
    input.expenses.map((expense) => expense.sourceWorkOrderId).filter((id): id is string => Boolean(id)),
  );

  for (const expense of input.expenses) {
    const propertyName =
      (expense.propertyId && propertyLabelById.get(expense.propertyId)) ||
      expense.propertyName?.trim() ||
      "Portfolio";
    const payee =
      (expense.vendorId && vendorNameById.get(expense.vendorId)) ||
      (expense.categoryCode === "service_fees" ? "Axis" : "—");
    const sourceWorkOrder = expense.sourceWorkOrderId
      ? workOrderById.get(expense.sourceWorkOrderId)
      : undefined;
    const paidChannel = sourceWorkOrder?.vendorPaymentChannel;
    const vendor = sourceWorkOrder?.vendorId ? vendorById.get(sourceWorkOrder.vendorId) : undefined;
    const baseRow: DemoManagerOutgoingPaymentRow = {
      id: `expense-${expense.id}`,
      propertyName,
      categoryLabel: expense.categoryLabel,
      payeeLabel: payee,
      chargeTitle: expense.memo?.trim() || expense.categoryLabel,
      amountLabel: formatMoney(expense.amountCents),
      dueDate: dueDateLabelFromIso(expense.expenseDate),
      bucket: "paid",
      statusLabel: paidChannel ? `Paid · ${managerVendorPayMethodLabel(paidChannel)}` : "Paid",
      expenseEntryId: expense.id,
      workOrderId: expense.sourceWorkOrderId ?? undefined,
      fromExpense: true,
      fromAxisFee: expense.categoryCode === "service_fees",
      paidViaChannel: paidChannel,
      paidAtLabel: sourceWorkOrder?.paidAt ? safeFormatDateTime(sourceWorkOrder.paidAt) : undefined,
      vendorId: sourceWorkOrder?.vendorId,
    };
    rows.push(enrichOutgoingRowWithVendorPayments(baseRow, vendor));
  }

  for (const workOrder of workOrders) {
    if (input.managerUserId && workOrder.managerUserId && workOrder.managerUserId !== input.managerUserId) continue;
    const bucket = workOrderBucket(workOrder);
    if (!bucket || bucket === "paid") continue;
    if (workOrderExpenseIds.has(workOrder.id)) continue;
    const amountCents = workOrderAmountCents(workOrder);
    const vendor = workOrder.vendorId ? vendorById.get(workOrder.vendorId) : undefined;
    const baseRow: DemoManagerOutgoingPaymentRow = {
      id: `work-order-${workOrder.id}`,
      propertyName: workOrder.propertyName,
      categoryLabel: "Vendor payment",
      payeeLabel: workOrder.vendorName?.trim() || "Vendor",
      chargeTitle: workOrder.title,
      amountLabel: amountCents > 0 ? formatMoney(amountCents) : workOrder.cost || "—",
      amountCents: amountCents > 0 ? amountCents : undefined,
      dueDate: dueDateLabelFromIso(workOrder.vendorMarkedDoneAt ?? workOrder.completedAt),
      bucket,
      statusLabel: workOrderStatusLabel(bucket),
      workOrderId: workOrder.id,
      vendorId: workOrder.vendorId,
    };
    rows.push(enrichOutgoingRowWithVendorPayments(baseRow, vendor));
  }

  for (const workOrder of workOrders) {
    if (input.managerUserId && workOrder.managerUserId && workOrder.managerUserId !== input.managerUserId) continue;
    if (workOrder.automationStatus !== "paid") continue;
    if (workOrderExpenseIds.has(workOrder.id)) continue;
    const amountCents = workOrderAmountCents(workOrder);
    const vendor = workOrder.vendorId ? vendorById.get(workOrder.vendorId) : undefined;
    const baseRow: DemoManagerOutgoingPaymentRow = {
      id: `work-order-paid-${workOrder.id}`,
      propertyName: workOrder.propertyName,
      categoryLabel: "Vendor payment",
      payeeLabel: workOrder.vendorName?.trim() || "Vendor",
      chargeTitle: workOrder.title,
      amountLabel: amountCents > 0 ? formatMoney(amountCents) : workOrder.cost || "—",
      amountCents: amountCents > 0 ? amountCents : undefined,
      dueDate: dueDateLabelFromIso(workOrder.paidAt ?? workOrder.completedAt),
      bucket: "paid",
      statusLabel: workOrder.vendorPaymentChannel
        ? `Paid · ${managerVendorPayMethodLabel(workOrder.vendorPaymentChannel)}`
        : "Paid",
      workOrderId: workOrder.id,
      vendorId: workOrder.vendorId,
      paidViaChannel: workOrder.vendorPaymentChannel,
      paidAtLabel: workOrder.paidAt ? safeFormatDateTime(workOrder.paidAt) : undefined,
    };
    rows.push(enrichOutgoingRowWithVendorPayments(baseRow, vendor));
  }

  for (const charge of paidCharges) {
    if (input.managerUserId && charge.managerUserId && charge.managerUserId !== input.managerUserId) continue;
    if (charge.status !== "paid" || !charge.axisPaymentsEnabledSnapshot) continue;
    const subtotalCents = parseCents(charge.amountLabel);
    const feeCents = residentConnectApplicationFeeCents(subtotalCents, "ach");
    if (feeCents <= 0) continue;
    rows.push({
      id: `axis-fee-${charge.id}`,
      propertyName: charge.propertyLabel,
      categoryLabel: "Axis payment cost",
      payeeLabel: "Axis",
      chargeTitle: `Processing fee — ${charge.title}`,
      amountLabel: formatMoney(feeCents),
      dueDate: dueDateLabelFromIso(charge.paidAt),
      bucket: "paid",
      statusLabel: "Paid",
      fromAxisFee: true,
    });
  }

  return rows.sort((a, b) => {
    const bucketOrder: Record<ManagerPaymentBucket, number> = { overdue: 0, pending: 1, paid: 2 };
    const bucketDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;
    return b.dueDate.localeCompare(a.dueDate);
  });
}

export const OUTGOING_PAYMENT_CATEGORY_CODES = [
  "service_fees",
  "property_tax",
  "taxes",
  "mortgage",
  "maintenance",
  "cleaning",
  "plumbing",
  "materials",
  "utilities",
  "insurance",
  "management",
  "other_expense",
] as const;
