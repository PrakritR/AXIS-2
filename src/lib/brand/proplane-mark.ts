/**
 * Canonical PropLane mark geometry — the ONLY place these numbers are
 * authored. A rounded house/chevron outline with a crossing X inside, drawn
 * with round caps + joins and no fill. Every rendering of the mark (in-app
 * React glyph, favicon, iOS app icon, splash screen, PDF exports, HTML
 * flyers) derives from these constants so there is a single source of truth
 * and no hand-edited copy can drift from another.
 *
 * Fixed-colour reference (for contexts that can't inherit a theme variable —
 * favicon, app icon, PDF/flyer exports, external services): `public/brand/proplane-mark.svg`,
 * whose `d` attributes MUST equal {@link PROPLANE_MARK_PATHS} verbatim
 * (enforced by tests/unit/proplane-mark.test.ts).
 *
 * `scripts/generate-brand-assets.mjs` is plain Node ESM (no TypeScript
 * loader) and therefore can't import this module directly — it re-declares
 * these same literal strings with a comment pointing back here, and
 * tests/unit/proplane-mark.test.ts asserts the script's source text still
 * contains every path from {@link PROPLANE_MARK_PATHS}, so an edit here
 * without a matching edit there fails the suite instead of drifting silently.
 */
export const PROPLANE_MARK_VIEWBOX_SIZE = 512;

export const PROPLANE_MARK_STROKE_WIDTH = 44;

export const PROPLANE_MARK_PATHS = [
  "M 84 452 L 84 218 a 54 54 0 0 1 21 -43 L 233 79 a 38 38 0 0 1 46 0 L 407 175 a 54 54 0 0 1 21 43 L 428 452",
  "M 170 288 L 342 452",
  "M 342 288 L 170 452",
] as const;

/** Fixed PropLane blue — use only where a literal colour is required (favicon, app icon, OG/PDF exports, external services). In-app renders should use `stroke-primary`/`currentColor` instead so the mark themes with the rest of the UI. */
export const PROPLANE_BLUE = "#2F6BFF";
