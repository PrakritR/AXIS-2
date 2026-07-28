export type MonthPoint = { key: string; label: string; value: number };

export type MonthlyProfitPoint = { key: string; label: string; profit: number };

/** The last N calendar months (oldest → current), keyed `YYYY-MM` with a short label. */
export function lastNMonths(nowMs: number, count = 6): { key: string; label: string }[] {
  const base = new Date(nowMs);
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      label: m.toLocaleString("en-US", { month: "short" }),
    });
  }
  return out;
}

/** `YYYY-MM` bucket key for an ISO date, or null when unparseable. */
export function monthKeyOf(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Sum a list into month buckets by an ISO-date accessor. */
export function bucketByMonth<T>(
  items: T[],
  months: { key: string; label: string }[],
  dateOf: (item: T) => string | undefined | null,
  amountOf: (item: T) => number,
): MonthPoint[] {
  const sums = new Map(months.map((m) => [m.key, 0]));
  for (const item of items) {
    const key = monthKeyOf(dateOf(item));
    if (key && sums.has(key)) sums.set(key, sums.get(key)! + (amountOf(item) || 0));
  }
  return months.map((m) => ({ key: m.key, label: m.label, value: sums.get(m.key) ?? 0 }));
}

export function mergeMonthlyProfit(payments: MonthPoint[], expenses: MonthPoint[]): MonthlyProfitPoint[] {
  return payments.map((p, i) => ({
    key: p.key,
    label: p.label,
    profit: p.value - (expenses[i]?.value ?? 0),
  }));
}

/** Parse a "$1,200.00" balance label into a numeric dollar amount. */
export function parseMoneyLabel(label: string): number {
  const n = Number(String(label).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
