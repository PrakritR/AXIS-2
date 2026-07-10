import twilio from "twilio";

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

/**
 * Send an SMS via Twilio. Silently skips if env vars aren't configured
 * or if either phone number can't be normalized to E.164.
 */
export async function sendSms(to: string, body: string, fromNumber: string): Promise<{ sent: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return { sent: false };

  const toNorm = normalizeE164(to);
  const fromNorm = normalizeE164(fromNumber);
  if (!toNorm || !fromNorm) return { sent: false, error: `Cannot normalize phone: to=${to} from=${fromNumber}` };

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({ to: toNorm, from: fromNorm, body });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
