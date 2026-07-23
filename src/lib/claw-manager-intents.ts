/**
 * Client-safe classifier for manager PropLane "agent …" SMS commands.
 * Command word is required so normal manager→resident relays stay unchanged.
 */

export const MANAGER_AGENT_COMMAND_WORD = "agent";

export type ManagerAgentIntent =
  | "help"
  | "mark_paid"
  | "lease_link"
  | "payments"
  | "unknown";

export type ClassifiedManagerAgentCommand = {
  /** True when the text starts with the command word (agent). */
  isCommand: boolean;
  intent: ManagerAgentIntent;
  /** Free-text resident hint (name / email / phone fragment), if any. */
  residentHint: string | null;
  /** Remainder after stripping the command word (for debugging). */
  rest: string;
};

/** Strip leading command word: "agent …" / "agent: …" / "Agent," */
export function stripManagerAgentCommandWord(text: string): { isCommand: boolean; rest: string } {
  const raw = text.trim();
  if (!raw) return { isCommand: false, rest: "" };
  const re = new RegExp(`^${MANAGER_AGENT_COMMAND_WORD}\\b[:\\s,.-]*`, "i");
  if (!re.test(raw)) return { isCommand: false, rest: raw };
  return { isCommand: true, rest: raw.replace(re, "").trim() };
}

/**
 * Strip trailing sentence punctuation (`.?!,`) in a single linear scan.
 * A `/[.?!,]+$/` regex backtracks polynomially on a long interior run of those
 * characters (CodeQL js/polynomial-redos), so trim by hand instead.
 */
function stripTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0 && ".?!,".includes(value.charAt(end - 1))) end -= 1;
  return value.slice(0, end);
}

function extractResidentHint(rest: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = rest.match(re);
    if (m?.[1]?.trim()) return stripTrailingPunctuation(m[1].trim()).trim() || null;
  }
  return null;
}

/**
 * Classify a manager SMS that may be an `agent` command.
 * Non-command texts return `{ isCommand: false }` so the normal relay still runs.
 */
export function classifyManagerAgentCommand(text: string): ClassifiedManagerAgentCommand {
  const { isCommand, rest } = stripManagerAgentCommandWord(text);
  if (!isCommand) {
    return { isCommand: false, intent: "unknown", residentHint: null, rest: text.trim() };
  }

  const lower = rest.toLowerCase();
  if (!rest || /^(help|menu|commands|\?)$/i.test(rest)) {
    return { isCommand: true, intent: "help", residentHint: null, rest };
  }

  // mark payment for X paid | mark X paid | mark payment paid
  if (/\bmark\b/.test(lower) && /\bpaid\b/.test(lower)) {
    // Capture group anchored to non-whitespace on both ends (`\S(?:.*?\S)??`)
    // rather than `(.+?)` sitting between two `\s+` delimiters that can all
    // match the same whitespace — that overlap backtracks polynomially
    // (CodeQL js/polynomial-redos). The trailing `??` keeps the optional tail
    // lazy, so the capture is leftmost-shortest exactly like `(.+?)` was
    // (`mark A paid B paid` still captures `A`).
    const residentHint = extractResidentHint(rest, [
      /\bmark\s+payment\s+for\s+(\S(?:.*?\S)??)\s+paid\b/i,
      /\bmark\s+(\S(?:.*?\S)??)\s+paid\b/i,
      /\bfor\s+(\S(?:.*?\S)??)\s+paid\b/i,
    ]);
    // Drop the literal word "payment" if it was captured as the hint.
    const cleaned =
      residentHint && !/^payment$/i.test(residentHint) ? residentHint : null;
    return { isCommand: true, intent: "mark_paid", residentHint: cleaned, rest };
  }

  // lease link / pull up lease / lease for X
  if (/\b(lease|e-?sign|signing)\b/i.test(rest)) {
    const residentHint = extractResidentHint(rest, [
      /\b(?:lease|link)\s+for\s+(.+)$/i,
      /\bfor\s+(.+)$/i,
    ]);
    return { isCommand: true, intent: "lease_link", residentHint, rest };
  }

  // payments / balance for X
  if (/\b(payment|payments|balance|charges|owing)\b/i.test(rest)) {
    const residentHint = extractResidentHint(rest, [
      /\b(?:payments?|balance|charges)\s+for\s+(.+)$/i,
      /\bfor\s+(.+)$/i,
    ]);
    return { isCommand: true, intent: "payments", residentHint, rest };
  }

  return { isCommand: true, intent: "unknown", residentHint: null, rest };
}

export function managerAgentHelpMenuText(): string {
  return [
    "PropLane manager commands — start with AGENT:",
    "AGENT help — this menu",
    "AGENT mark payment for <resident> paid",
    "AGENT mark paid — uses your open resident thread",
    "AGENT lease — lease link (open thread or name)",
    "AGENT lease for <resident>",
    "AGENT payments for <resident> — list open charges",
    "Without AGENT, your text still relays to the resident.",
  ].join("\n");
}
