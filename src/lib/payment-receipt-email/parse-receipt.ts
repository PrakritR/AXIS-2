export type PaymentReceiptChannel = "venmo" | "zelle";

export type ParsedPaymentReceipt = {
  channel: PaymentReceiptChannel;
  amountCents: number;
  paymentReference: string;
};

const PL_REFERENCE = /\b(PL-[A-Z0-9]{6})\b/;
const AMOUNT_PATTERNS = [
  /\$\s*([\d,]+(?:\.\d{2})?)/,
  /(?:USD\s*)?([\d,]+\.\d{2})\s*(?:USD)?/i,
  /amount[:\s]+\$?\s*([\d,]+(?:\.\d{2})?)/i,
];

const VENMO_SENDER_SUFFIXES = ["@venmo.com", "@mail.venmo.com", "@e.venmo.com"];
const ZELLE_SENDER_SUFFIXES = ["@zellepay.com", "@notify.zellepay.com"];

function parseAmountCents(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const dollars = Number.parseFloat(match[1].replace(/,/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) continue;
    return Math.round(dollars * 100);
  }
  return null;
}

function inferChannel(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): PaymentReceiptChannel | null {
  const from = opts.fromEmail.toLowerCase();
  if (VENMO_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return "venmo";
  if (ZELLE_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return "zelle";

  const haystack = `${opts.subject}\n${opts.body}`.toLowerCase();
  const venmoHits = (haystack.match(/\bvenmo\b/g) ?? []).length;
  const zelleHits = (haystack.match(/\bzelle\b/g) ?? []).length;
  if (venmoHits > 0 && zelleHits === 0) return "venmo";
  if (zelleHits > 0 && venmoHits === 0) return "zelle";
  if (venmoHits > zelleHits) return "venmo";
  if (zelleHits > venmoHits) return "zelle";
  return null;
}

function senderLooksLikeReceipt(fromEmail: string, channel: PaymentReceiptChannel | null): boolean {
  const from = fromEmail.toLowerCase();
  if (VENMO_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return true;
  if (ZELLE_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return true;
  if (!channel) return false;
  return (
    from.includes("zelle") ||
    from.includes("venmo") ||
    from.includes("chase.com") ||
    from.includes("bankofamerica.com") ||
    from.includes("wellsfargo.com")
  );
}

/**
 * Parse a Venmo or Zelle payment receipt email for PL- reference + amount.
 * Returns null when the message does not look like a trusted receipt.
 */
export function parsePaymentReceiptEmail(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): ParsedPaymentReceipt | null {
  const subject = opts.subject.trim();
  const body = opts.body.trim();
  const combined = `${subject}\n${body}`;
  const refMatch = PL_REFERENCE.exec(combined);
  if (!refMatch?.[1]) return null;

  const amountCents = parseAmountCents(combined);
  if (amountCents == null) return null;

  const channel = inferChannel(opts);
  if (!channel) return null;
  if (!senderLooksLikeReceipt(opts.fromEmail, channel)) return null;

  return {
    channel,
    amountCents,
    paymentReference: refMatch[1],
  };
}
