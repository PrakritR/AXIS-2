export function dollarsToCents(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function centsToUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function formatReportMoney(cents: number): string {
  return centsToUsd(cents);
}

export function formatBalanceDue(cents: number): string {
  if (cents <= 0) return "$0.00";
  return centsToUsd(cents);
}
