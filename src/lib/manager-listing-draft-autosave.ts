import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/**
 * Row/field identifiers are minted with `rid()` on every fresh row, so two
 * structurally identical submissions never share them. They carry no manager
 * intent — position in the array is the identity that matters here — so they
 * are dropped before comparing.
 */
const VOLATILE_KEYS = new Set(["id"]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      const entry = source[key];
      // An absent key and an explicitly-undefined one are the same submission.
      if (entry === undefined) continue;
      out[key] = stableValue(entry);
    }
    return out;
  }
  return value;
}

/**
 * A key-order-independent snapshot of everything a manager can type into the
 * add-listing wizard. Comparing two fingerprints answers "did anything the
 * manager cares about change?" without enumerating fields — an allowlist would
 * silently discard work the day a new field is added to the wizard.
 */
export function listingSubmissionFingerprint(sub: ManagerListingSubmissionV1): string {
  return JSON.stringify(stableValue(sub));
}

/**
 * True when the wizard holds work worth persisting as a draft on close.
 *
 * The baseline is the submission the wizard OPENED with, not a pristine
 * default: a brand-new wizard opens on the default (so any typing counts), and
 * a resumed draft opens on its saved content (so re-closing it untouched is not
 * a needless write). This is what keeps an untouched wizard from littering the
 * Drafts stage with an "Untitled draft".
 */
export function listingWizardHasUnsavedInput(
  current: ManagerListingSubmissionV1,
  baselineFingerprint: string,
): boolean {
  return listingSubmissionFingerprint(current) !== baselineFingerprint;
}
