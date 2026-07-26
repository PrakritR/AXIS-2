import type { HouseholdCharge } from "@/lib/household-charges";
import { parseMoneyAmount } from "@/lib/parse-money";

/**
 * Reference-less receipt matching for Zelle/Venmo notifications that carry NO
 * `PL-XXXXXX` code. Real residents write free-text notes like
 * "Application fee for room 5 at 5257 Brooklyn avenue", so we match on the
 * combination of amount + payer identity + property/unit context.
 *
 * This is a MONEY path: a wrong auto-credit is worse than leaving a charge
 * pending, so every helper here is deliberately conservative. A match is only
 * ever "strong" when an identity signal (payer name OR property/unit context)
 * lines up; amount alone never confirms a charge. When the amount matches but no
 * identity signal does, the caller surfaces the receipt as ambiguous for the
 * manager to confirm rather than guessing.
 */

/** Bound the memo we scan so a pathological body can't be walked in full. */
export const MEMO_SCAN_MAX_CHARS = 4000;

/** Generic street-type / connector words that carry no identifying signal on their own. */
const STREET_STOPWORDS = new Set([
  "at",
  "the",
  "apt",
  "apartment",
  "unit",
  "room",
  "rm",
  "ste",
  "suite",
  "fl",
  "floor",
  "st",
  "street",
  "ave",
  "avenue",
  "av",
  "road",
  "rd",
  "blvd",
  "boulevard",
  "dr",
  "drive",
  "ln",
  "lane",
  "ct",
  "court",
  "way",
  "pl",
  "place",
  "ter",
  "terrace",
  "cir",
  "circle",
  "hwy",
  "highway",
  "n",
  "s",
  "e",
  "w",
  "north",
  "south",
  "east",
  "west",
  "for",
  "and",
  "of",
]);

/** Lowercased alphanumeric tokens of length ≥ 2 (numbers kept as-is). */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
}

/** Name tokens: alpha-only tokens of length ≥ 2 (drops middle initials and digits). */
function nameTokens(value: string): string[] {
  return tokenize(value).filter((t) => /^[a-z]+$/.test(t));
}

/**
 * True only when the payer name and the resident-on-file name share at least two
 * tokens (first + last). Requires both sides to carry ≥ 2 name tokens so a lone
 * first name ("John") can never match every John on the ledger.
 */
export function payerNameMatchesResident(payerName: string | null, residentName: string): boolean {
  if (!payerName) return false;
  const pt = nameTokens(payerName);
  const rt = new Set(nameTokens(residentName));
  if (pt.length < 2 || rt.size < 2) return false;
  const overlap = pt.filter((t) => rt.has(t));
  return overlap.length >= 2;
}

/**
 * True only when the memo text contains BOTH the property's street number and at
 * least one meaningful (non street-type) word from its label — e.g. "5257" and
 * "brooklyn" for a "5257 Brooklyn Avenue" listing. Either alone is too weak.
 */
export function memoMatchesProperty(memoText: string, propertyLabel: string): boolean {
  const labelTokens = tokenize(propertyLabel);
  const numberTokens = labelTokens.filter((t) => /^\d+$/.test(t));
  const wordTokens = labelTokens.filter((t) => /^[a-z]+$/.test(t) && t.length >= 3 && !STREET_STOPWORDS.has(t));
  if (numberTokens.length === 0 || wordTokens.length === 0) return false;
  const memoSet = new Set(tokenize(memoText));
  const numberHit = numberTokens.some((n) => memoSet.has(n));
  const wordHit = wordTokens.some((w) => memoSet.has(w));
  return numberHit && wordHit;
}

/** Remaining-balance (preferred) or original amount of a charge, in cents. */
export function chargeAmountCents(charge: HouseholdCharge): number {
  const label = charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "";
  return Math.round(parseMoneyAmount(label) * 100);
}

export type FallbackReceiptContext = {
  amountCents: number;
  payerName: string | null;
  memoText: string;
};

export type FallbackMatchResult =
  | { kind: "matched"; charge: HouseholdCharge }
  | { kind: "ambiguous"; matchCount: number }
  | { kind: "none" };

/** Amount equal within a cent of rounding slop. */
function amountMatches(charge: HouseholdCharge, amountCents: number): boolean {
  const expected = chargeAmountCents(charge);
  if (expected <= 0) return false;
  return Math.abs(expected - amountCents) <= 1;
}

/**
 * Match a reference-less receipt to at most one pending charge.
 *
 * - Zero charges share the amount → `none` (nothing to attribute it to).
 * - Exactly one charge shares the amount AND a strong identity signal → `matched`.
 * - More than one strong candidate → `ambiguous` (manager confirms — never guess).
 * - Amount matches but NO candidate has an identity signal → `ambiguous`, so the
 *   manager still sees the payment instead of it being silently credited or dropped.
 */
export function matchChargeByContext(
  charges: HouseholdCharge[],
  ctx: FallbackReceiptContext,
): FallbackMatchResult {
  const amountCandidates = charges.filter((c) => amountMatches(c, ctx.amountCents));
  if (amountCandidates.length === 0) return { kind: "none" };

  const strong = amountCandidates.filter(
    (c) => payerNameMatchesResident(ctx.payerName, c.residentName) || memoMatchesProperty(ctx.memoText, c.propertyLabel),
  );

  if (strong.length === 1) return { kind: "matched", charge: strong[0]! };
  if (strong.length > 1) return { kind: "ambiguous", matchCount: strong.length };

  // Amount lines up but nothing confirms identity — surface for manual confirm,
  // never auto-credit on amount alone.
  return { kind: "ambiguous", matchCount: amountCandidates.length };
}
