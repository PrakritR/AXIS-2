/** Parse a human-entered dollar label into a number (first numeric run). */
export function parseMoneyAmount(label: string): number {
  const n = Number.parseFloat(String(label).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
