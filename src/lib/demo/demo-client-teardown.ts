/**
 * Client-side teardown for the demo sandbox stores.
 *
 * The demo reuses the SAME sessionStorage keys and storage libraries as the real
 * portal, isolated only by the pathname-derived `isDemoModeActive()` flag. That
 * is safe on the dedicated `/demo` route, but the landing page now embeds the
 * demo at `/`, which a signed-in manager also visits. Two guards keep demo data
 * out of a real portal:
 *
 *  1. The homepage embed never SEEDS for a signed-in user (see `demo-seed.ts`),
 *     so a manager with real data never populates the shared stores.
 *  2. When the embedded demo unmounts or the page is left (signed-out visitor
 *     who then signs in — sign-in does a full `location.replace`, which clears
 *     module-memory caches but NOT sessionStorage), we purge the demo-seeded
 *     sessionStorage keys so the real portal never reads demo residue.
 *
 * `purgeDemoSeededSessionStorage` only ever runs from a demo-surface teardown in
 * a signed-out context (see the caller's `!isDemoSignedIn()` guard), so wiping
 * the portal-store sessionStorage keys can't discard a real user's cache.
 */

/** localStorage fast-path the navbar also uses to detect a live session. */
const SIGNED_IN_FLAG_KEY = "axis:signed_in";

/** Prefixes covering every portal-store sessionStorage key the demo seeds into. */
const DEMO_STORE_KEY_PREFIXES = ["axis:", "axis_"];

export function isDemoSignedIn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SIGNED_IN_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remove every demo-seeded portal-store key from sessionStorage. */
export function purgeDemoSeededSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const store = window.sessionStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && DEMO_STORE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    /* ignore */
  }
}
