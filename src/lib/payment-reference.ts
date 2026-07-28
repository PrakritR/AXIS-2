/** Stable short memo code residents include in Zelle/Venmo payments for manager matching. */
export function generatePaymentReference(chargeId: string): string {
  const trimmed = chargeId.trim();
  if (!trimmed) return "PL-UNKNOWN";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  const code = hash.toString(36).toUpperCase().slice(0, 6).padStart(6, "0");
  return `PL-${code}`;
}
