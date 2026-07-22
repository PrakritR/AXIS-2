/**
 * The one switch that decides whether `/demo` may read the canonical
 * `@test.axis.local` accounts' real portal rows (`GET /api/demo/portal-snapshot`)
 * or must serve the empty static snapshot from `demo-guided-data.ts`.
 *
 * **Currently OFF, deliberately and temporarily.** The fictional portfolio the
 * sandbox used to ship (Ava Nguyen, The Pioneer, Cascade Lofts, …) was deleted
 * from the code, but the same rows still sit on the canonical accounts in the
 * dev/test and production Supabase projects — and the mirror wins over the
 * static snapshot whenever those accounts hold data. Emptying the code alone
 * therefore would not empty a deployed `/demo`. Turning the mirror off is a
 * code-only guarantee that every environment renders a clean, empty sandbox
 * immediately, without touching a database.
 *
 * **This is meant to be turned back on.** The mirror is how an accurate demo
 * portfolio is supposed to get in — a manager signs into the canonical accounts
 * and enters real data. Once the leftover fictional rows are purged from those
 * accounts (a separate, supervised live-DB task), flip this back to `true`; the
 * mirror code is intact and unchanged underneath. Do not delete the mirror.
 *
 * See `docs/agents/demo-sandbox.md` for the two-source model.
 */
export const DEMO_PORTAL_MIRROR_ENABLED = false;
