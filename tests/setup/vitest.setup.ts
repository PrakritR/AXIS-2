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
// task queue, drained from a `setImmediate` message loop. `act()` (inside Testing
// Library's `render` / `fireEvent`) flushes the effects synchronously, but an
// update that lands outside act — a `waitFor`/`findBy*` resolution, an effect's
// promise — schedules a real task, and its first statement reads `window.event`.
// If Vitest tears the jsdom environment down before that task runs, it throws
// `ReferenceError: window is not defined` as an unhandled error and fails the
// whole run even though every test passed.
//
// Setup-file hooks are registered before any test file's, and Vitest runs
// `afterAll` in reverse registration order, so this is the last hook before
// teardown. Yielding a fixed number of macrotasks here is a guess: the scheduler
// splits its queue across as many `setImmediate` slices as `shouldYieldToHost`
// asks for, and a flushed effect can commit and queue another task, so a loaded
// CI box needs more slices than a quiet laptop. Instead, wait for quiescence:
// an Idle-priority task sorts behind every task React schedules (all of which
// expire sooner) including continuations queued while we wait, so it can only
// run once the queue in front of it is empty.
afterAll(async () => {
  if (typeof window === "undefined") return;
  const scheduler = await import("scheduler");
  await new Promise<void>((resolve) => {
    scheduler.unstable_scheduleCallback(scheduler.unstable_IdlePriority, () => {
      resolve();
      return null;
    });
  });
  // Anything queued from a microtask during that final slice still needs a turn.
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
});
