/**
 * The literal string an unnamed application draft used to be STORED under.
 *
 * `buildInProgressApplicationRow` wrote `name: "Applicant"` whenever the
 * applicant had not typed a legal name yet. That placeholder is a real value in
 * the row, so it propagated: `loadManagerReportDisplayContext` indexes resident
 * names by email off application rows, and a single nameless draft overwrote
 * the resident's real name for EVERY finance row on that email — "Applicant"
 * showed as the resident on 7 of 8 Finances › Income rows, and Documents ›
 * Applications listed a row whose applicant name was the word "Applicant"
 * (manager audit F-FIN-2).
 *
 * New drafts now store an empty name. This module is what keeps the rows
 * already written that way from leaking into a financial record.
 */
export const APPLICANT_PLACEHOLDER_NAME = "Applicant";

const PLACEHOLDER_NAMES = new Set(["applicant", "unknown", "n/a", "—", "-"]);

/** True when a stored applicant name identifies nobody and must not be displayed as a person. */
export function isPlaceholderApplicantName(name: string | null | undefined): boolean {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return true;
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

/** A stored applicant name only when it names a real person, else `""`. */
export function realApplicantName(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  return isPlaceholderApplicantName(trimmed) ? "" : trimmed;
}

/**
 * Who to show for an application row: their real name, else the email (which
 * genuinely identifies them), else the generic placeholder — never the
 * placeholder while an email is available.
 */
export function applicantDisplayName(
  row: { name?: string | null; email?: string | null },
  fallback = APPLICANT_PLACEHOLDER_NAME,
): string {
  return realApplicantName(row.name) || String(row.email ?? "").trim() || fallback;
}
