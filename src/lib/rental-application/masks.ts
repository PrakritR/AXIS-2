/** Keep digits only for storage / validation. */
export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Display (###) ###-#### from up to 10 digits. */
export function maskPhoneInput(prev: string, next: string): string {
  const d = digitsOnly(next).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Display ###-##-#### from up to 9 digits. */
export function maskSsnInput(next: string): string {
  const d = digitsOnly(next).slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** Strip currency to digits for parsing. */
export function parseMoneyInput(s: string): string {
  return s.replace(/[^\d.]/g, "");
}

/** Format integer part with commas for display (no decimals enforced for income). */
export function formatMoneyBlur(raw: string): string {
  const t = raw.replace(/[^\d]/g, "");
  if (!t) return "";
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}
