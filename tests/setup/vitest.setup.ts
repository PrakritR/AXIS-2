import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

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
