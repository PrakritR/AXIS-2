import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

const KEY = "axis_manager_work_orders_v2";
export const MANAGER_WORK_ORDERS_EVENT = "axis:manager-work-orders";

const EMPTY_FALLBACK: DemoManagerWorkOrderRow[] = [];

/**
 * Stable snapshot for SSR, hydration, and empty localStorage.
 */
export const MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT: DemoManagerWorkOrderRow[] = EMPTY_FALLBACK;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(MANAGER_WORK_ORDERS_EVENT));
}

export function readManagerWorkOrderRows(fallback: DemoManagerWorkOrderRow[] = EMPTY_FALLBACK): DemoManagerWorkOrderRow[] {
  if (!canUseStorage()) {
    return fallback === EMPTY_FALLBACK ? MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT : [...fallback];
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return fallback === EMPTY_FALLBACK ? MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT : [...fallback];
    }
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) {
      return fallback === EMPTY_FALLBACK ? MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT : [...fallback];
    }
    const stored = v as DemoManagerWorkOrderRow[];
    const byId = new Map(stored.map((r) => [r.id, r]));
    const fallbackIds = new Set(fallback.map((f) => f.id));
    const merged = fallback.map((seed) => {
      const o = byId.get(seed.id);
      return o ? { ...seed, ...o } : seed;
    });
    const extras = stored.filter((s) => s.id && !fallbackIds.has(s.id));
    return [...merged, ...extras];
  } catch {
    return fallback === EMPTY_FALLBACK ? MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT : [...fallback];
  }
}

export function writeManagerWorkOrderRows(rows: DemoManagerWorkOrderRow[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    emit();
  } catch {
    /* quota */
  }
}

export function updateManagerWorkOrder(
  id: string,
  updater: (row: DemoManagerWorkOrderRow) => DemoManagerWorkOrderRow,
): void {
  const rows = readManagerWorkOrderRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const next = [...rows];
  next[idx] = updater(next[idx]!);
  writeManagerWorkOrderRows(next);
}

export function resetManagerWorkOrderRows(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(KEY);
  emit();
}

export function subscribeManagerWorkOrders(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MANAGER_WORK_ORDERS_EVENT, cb);
  return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, cb);
}
