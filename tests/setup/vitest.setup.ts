import "@testing-library/jest-dom/vitest";
import { afterAll, vi } from "vitest";

process.env.FINANCIALS_TIN_ENCRYPTION_KEY ??= "test-only-tin-key-do-not-use-in-prod";

// Node >= 22 ships its own `localStorage` global that stays undefined unless the
// process is started with `--localstorage-file`. Vitest's jsdom environment only
// copies window keys that are missing from globalThis, so that built-in shadows
// jsdom's real Storage and `window.localStorage` reads as undefined. jsdom still
// created it (`window._localStorage`), so point the global back at it.
{
  const globalWithStorage = globalThis as typeof globalThis & { _localStorage?: Storage };
  if (!globalWithStorage.localStorage && globalWithStorage._localStorage) {
    Object.defineProperty(globalWithStorage, "localStorage", {
      value: globalWithStorage._localStorage,
      configurable: true,
      writable: true,
    });
  }
}

vi.mock("server-only", () => ({}));

// Every React commit queues a passive-effect flush on the `scheduler` package's
// `setImmediate` task queue. `act()` (inside Testing Library's `render` /
// `fireEvent`) flushes the effects synchronously, but the queued task itself is
// never cancelled, and its first statement reads `window.event`. If Vitest tears
// the jsdom environment down before that task runs — which it does whenever a
// file's last render lands close to the end of the file, and far more often on a
// loaded CI box — the task throws `ReferenceError: window is not defined` as an
// unhandled error and fails the whole run even though every test passed.
//
// Setup-file hooks are registered before any test file's, and Vitest runs
// `afterAll` in reverse registration order, so this is the last hook before
// teardown: yield one macrotask there and the queued scheduler task drains while
// the document is still alive.
afterAll(async () => {
  if (typeof window === "undefined") return;
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
});
