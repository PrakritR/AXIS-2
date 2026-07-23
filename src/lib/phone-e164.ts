export function normalizeE164(phone: string): string | null {
  const trimmed = phone.trim();
  // Already-international input ("+44 20 7946 0958") passes through; bare
  // digits keep the US default so existing 10/11-digit data still works.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
