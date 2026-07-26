export type PaymentReceiptChannel = "venmo" | "zelle";

export type ParsedPaymentReceipt = {
  channel: PaymentReceiptChannel;
  amountCents: number;
  paymentReference: string;
  referenceKind: "resident_charge" | "work_order";
};

const PL_REFERENCE = /\b(PL-[A-Z0-9]{6})\b/;
const WO_REFERENCE = /\b(WO-[A-Z0-9]{6})\b/;
// Every quantifier is bounded so these can only scan linearly — an unbounded
// `[\d,]+` before a required `.d{2}` suffix backtracks polynomially on a long
// run of commas (js/polynomial-redos). A real money figure is well under 15
// digit/comma chars; nothing legitimate needs more.
const AMOUNT_PATTERNS = [
  /\$\s{0,8}([\d,]{1,15}(?:\.\d{2})?)/,
  /(?:USD\s{0,8})?([\d,]{1,15}\.\d{2})\s{0,8}(?:USD)?/i,
  /amount[:\s]{1,8}\$?\s{0,8}([\d,]{1,15}(?:\.\d{2})?)/i,
];
/** Belt-and-suspenders cap so a pathologically large body can't be scanned in full. */
const AMOUNT_SCAN_MAX_CHARS = 50_000;

export const VENMO_SENDER_SUFFIXES = ["@venmo.com", "@mail.venmo.com", "@e.venmo.com"];
export const ZELLE_SENDER_SUFFIXES = ["@zellepay.com", "@notify.zellepay.com"];

function parseAmountCents(text: string): number | null {
  const scoped = text.length > AMOUNT_SCAN_MAX_CHARS ? text.slice(0, AMOUNT_SCAN_MAX_CHARS) : text;
  for (const pattern of AMOUNT_PATTERNS) {
    const match = pattern.exec(scoped);
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

/**
 * Banks that legitimately send Zelle receipts, matched on the sender's real
 * host — never a substring. This is a money-path authentication check: it
 * decides whether a receipt is genuine, which then marks rent PAID. Keep the
 * allow-list here and here only.
 */
export const BANK_RECEIPT_DOMAINS = ["chase.com", "bankofamerica.com", "wellsfargo.com"] as const;

/** Exact host or a true subdomain of an allowed domain — `chase.com` / `secure.chase.com`, not `chase.com.evil.example`. */
function hostMatchesDomain(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Real hostname of a bare host or URL-ish string; null if unparseable (never fall through to accept). */
function hostnameFromUrlish(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const candidate of [trimmed, `https://${trimmed}`]) {
    try {
      const host = new URL(candidate).hostname;
      if (host) return host;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

/** Domain after the last `@` of an email address, lowercased; null if there is none. */
function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * True only when the sender's real host is an allowed bank domain (exact or a
 * true subdomain). Rejects lookalikes (`chase.com.attacker.example`) and URLs
 * that merely mention a bank domain (`attacker.example/?u=chase.com`). Accepts
 * both an email sender (`alerts@chase.com`) and a bare host/URL. Unparseable or
 * hostless input is REJECTED.
 */
export function bankSenderIsAllowed(fromEmailOrHost: string): boolean {
  const host = emailDomain(fromEmailOrHost) ?? hostnameFromUrlish(fromEmailOrHost);
  if (!host) return false;
  return hostMatchesDomain(host, BANK_RECEIPT_DOMAINS);
}

function senderLooksLikeReceipt(fromEmail: string, channel: PaymentReceiptChannel | null): boolean {
  const from = fromEmail.toLowerCase();
  if (VENMO_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return true;
  if (ZELLE_SENDER_SUFFIXES.some((suffix) => from.endsWith(suffix))) return true;
  if (!channel) return false;
  return from.includes("zelle") || from.includes("venmo") || bankSenderIsAllowed(fromEmail);
}

function parseWithReference(
  opts: { fromEmail: string; subject: string; body: string },
  pattern: RegExp,
  referenceKind: ParsedPaymentReceipt["referenceKind"],
): ParsedPaymentReceipt | null {
  const subject = opts.subject.trim();
  const body = opts.body.trim();
  const combined = `${subject}\n${body}`;
  const refMatch = pattern.exec(combined);
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
    referenceKind,
  };
}

/** Parse resident charge receipt (PL- reference). */
export function parsePaymentReceiptEmail(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): ParsedPaymentReceipt | null {
  return parseWithReference(opts, PL_REFERENCE, "resident_charge");
}

/** Bound the memo text we retain for reference-less matching. */
const MEMO_CONTEXT_MAX_CHARS = 4000;

/**
 * Trusted senders mail far more than received-money receipts: payment requests,
 * request reminders, statements, and the account holder's own outbound "You
 * paid" notices all come from the same hosts and all carry a dollar amount.
 * None of them mean money arrived, so none may ever mark a charge paid. The
 * request note is fully payer-controlled, which makes an unguarded request
 * email a resident-triggerable false credit.
 *
 * These reject words are checked against the SUBJECT line only — the
 * transaction headline, where they reliably name the email's purpose. Receipt
 * BODY boilerplate legitimately contains them ("If you didn't request this
 * transfer", "Send and request money", "view your statement"), as can a payer's
 * own note ("rent as requested"), and none of that may veto a genuine receipt.
 *
 * Any subject that mentions "request" in ANY form — "X requests $50", "is
 * requesting", "payment request from X", "sent you a request for $X" — is a
 * SOLICITATION and is rejected wholesale, regardless of which other words
 * surround it. The single exemption is a request COMPLETION — Venmo's "X paid
 * your $50.00 request" / "X completed your request" — which is genuine money
 * received (a manager collecting rent via Venmo requests).
 */
const RECEIPT_SUBJECT_REJECT_PATTERNS = [
  /\byou paid\b/i,
  /\byou sent\b/i,
  /\bis charging\b/i,
  /\breminder\b/i,
  /\bstatement\b/i,
  /\btransaction history\b/i,
];

/**
 * The only "request"-flavored phrasings that mean money RECEIVED: a completed
 * Venmo request. Everything else containing "request" is a solicitation.
 */
const RECEIPT_REQUEST_COMPLETION_PATTERNS = [
  /\bpaid your\b[^\n]{0,60}?\brequest\b/i,
  /\bcompleted your\b[^\n]{0,60}?\brequest\b/i,
];

/**
 * Positive received-money phrasings, drawn from real provider/bank copy:
 * Venmo "X paid you $Y" / "X paid your $Y request", Zelle app "X sent you $Y",
 * Chase/BofA "You received $Y from X", Wells Fargo "You've received money with
 * Zelle®". Directional by construction: an outbound notice says "You paid X" /
 * "You sent X" and a solicitation says "X requests $Y" / "sent you a request",
 * none of which contain these shapes — every direct phrasing looks ahead to
 * refuse a trailing "… request" on the same line, so a noun-phrased
 * solicitation can never qualify as inbound; completions qualify only via the
 * dedicated completion patterns.
 */
const RECEIPT_INBOUND_PATTERNS = [
  /\bpaid you\b(?![^\n]{0,60}?\brequest\b)/i,
  /\bsent you\b(?![^\n]{0,60}?\brequest\b)/i,
  /\byou(?:['’]ve| have)? received\b(?![^\n]{0,60}?\brequest\b)/i,
  /\breceived money with\s+zelle\b/i,
  /\breceived\s+\$?[\d.,]{1,15}\s+from\b/i,
  ...RECEIPT_REQUEST_COMPLETION_PATTERNS,
];

/**
 * The transaction headline lives at the top of the notification; bounding the
 * positive-signal scan keeps a long footer from being what qualifies an email.
 */
const INBOUND_SIGNAL_BODY_MAX_CHARS = 2000;

/**
 * True only when the email POSITIVELY reads as money received — an inbound
 * phrasing ("X paid you", "sent you", "you've/you have received",
 * "received $… from Y", "X paid your $Y request") in the subject or the top of
 * the body — AND the subject does not headline a solicitation/reminder/
 * statement/outbound send. The solicitation reject gates the WHOLE decision:
 * any subject mentioning "request" that is not a completion is refused before
 * a single inbound pattern is consulted, so "sent you a request for $X" and
 * "You have received a payment request from X" can never qualify via the
 * phrasings they embed; the per-pattern lookaheads catch the same shapes when
 * they appear only in the body.
 */
export function receiptIndicatesInboundPayment(subject: string, body: string): boolean {
  if (RECEIPT_SUBJECT_REJECT_PATTERNS.some((pattern) => pattern.test(subject))) return false;
  if (
    /\brequest/i.test(subject) &&
    !RECEIPT_REQUEST_COMPLETION_PATTERNS.some((pattern) => pattern.test(subject))
  ) {
    return false;
  }
  const headline = `${subject}\n${body.slice(0, INBOUND_SIGNAL_BODY_MAX_CHARS)}`;
  return RECEIPT_INBOUND_PATTERNS.some((pattern) => pattern.test(headline));
}

/**
 * A resident-charge receipt with everything we can pull off the notification —
 * including receipts that carry NO `PL-` code. `paymentReference` is null when
 * absent; `payerName` and `memoText` back the reference-less fallback match.
 */
export type ResidentReceiptContext = {
  channel: PaymentReceiptChannel;
  amountCents: number;
  /** `PL-XXXXXX` code if the resident included one, else null. */
  paymentReference: string | null;
  /** Display name of the person who sent the payment, from the notification copy. */
  payerName: string | null;
  /** Subject + body (bounded) retained only for property/unit context matching. */
  memoText: string;
};

/**
 * Pull the payer's display name out of a Zelle/Venmo notification. Handles the
 * common received-money phrasings: "Junaid Mohammed paid you $50.00",
 * "… sent you …", "You received $50.00 from Junaid Mohammed", and the
 * request-completion forms "Junaid Mohammed paid your $50.00 request" /
 * "… completed your request". Returns null when no name can be confidently
 * isolated.
 */
export function extractReceiptPayerName(subject: string, body: string): string | null {
  const hay = `${subject}\n${body}`;
  const patterns = [
    /^\s*([A-Za-z][A-Za-z.'\- ]{1,60}?)\s+paid you\b/im,
    /^\s*([A-Za-z][A-Za-z.'\- ]{1,60}?)\s+sent you\b/im,
    /^\s*([A-Za-z][A-Za-z.'\- ]{1,60}?)\s+paid your\b/im,
    /^\s*([A-Za-z][A-Za-z.'\- ]{1,60}?)\s+completed your\b/im,
    /\breceived\b[^\n]{0,40}?\bfrom\s+([A-Za-z][A-Za-z.'\- ]{1,60}?)(?:\s+with\s+zelle|\s+for\b|[.,!\n]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(hay);
    const raw = match?.[1]?.replace(/\s+/g, " ").trim();
    if (raw && /[A-Za-z]{2,}/.test(raw) && raw.toLowerCase() !== "you") return raw;
  }
  return null;
}

/**
 * Parse a resident-charge receipt for BOTH the reference path and the
 * reference-less fallback. Requires a trusted channel + sender + a positive
 * amount (same authentication as {@link parsePaymentReceiptEmail}) AND
 * received-money phrasing ({@link receiptIndicatesInboundPayment}) — a
 * payment request, reminder, statement, or outbound send is never a candidate,
 * even when it carries a `PL-` code. The code itself is optional here. Returns
 * null for anything that is not a genuine, amount-bearing inbound Zelle/Venmo
 * receipt.
 */
export function parseResidentReceiptContext(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): ResidentReceiptContext | null {
  const subject = opts.subject.trim();
  const body = opts.body.trim();
  const combined = `${subject}\n${body}`;

  const channel = inferChannel(opts);
  if (!channel) return null;
  if (!senderLooksLikeReceipt(opts.fromEmail, channel)) return null;
  if (!receiptIndicatesInboundPayment(subject, body)) return null;

  const amountCents = parseAmountCents(combined);
  if (amountCents == null) return null;

  const refMatch = PL_REFERENCE.exec(combined);
  return {
    channel,
    amountCents,
    paymentReference: refMatch?.[1] ?? null,
    payerName: extractReceiptPayerName(subject, body),
    memoText: combined.slice(0, MEMO_CONTEXT_MAX_CHARS),
  };
}

/** Parse vendor work-order payout receipt (WO- reference). */
export function parseWorkOrderPaymentReceiptEmail(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): ParsedPaymentReceipt | null {
  return parseWithReference(opts, WO_REFERENCE, "work_order");
}

/** Parse either PL- or WO- payment receipt. */
export function parseAnyPaymentReceiptEmail(opts: {
  fromEmail: string;
  subject: string;
  body: string;
}): ParsedPaymentReceipt | null {
  return parsePaymentReceiptEmail(opts) ?? parseWorkOrderPaymentReceiptEmail(opts);
}
