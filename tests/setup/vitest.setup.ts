import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.FINANCIALS_TIN_ENCRYPTION_KEY ??= "test-only-tin-key-do-not-use-in-prod";

vi.mock("server-only", () => ({}));

// Node 24+ ships its own `localStorage` global, which is `undefined` unless the
// process was started with `--experimental-webstorage --localstorage-file=…`.
// Vitest's jsdom environment copies Node's globals onto the jsdom window, so on
// a newer runtime than the pinned one (`.nvmrc` = 22) that undefined value lands
// as an OWN `window.localStorage` property and shadows the real jsdom Storage —
// `window.sessionStorage` survives, `window.localStorage` does not. Any suite
// touching it then dies in `beforeEach` before a single assertion runs, which
// reads as a product failure when nothing about the product changed.
//
// Restore a spec-shaped Storage when (and only when) it is missing, so the same
// suites behave identically on Node 22 and on a newer local runtime.
if (typeof window !== "undefined" && !window.localStorage) {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(String(key)) ? entries.get(String(key))! : null),
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(String(key)),
    setItem: (key: string, value: string) => void entries.set(String(key), String(value)),
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: false });
}
