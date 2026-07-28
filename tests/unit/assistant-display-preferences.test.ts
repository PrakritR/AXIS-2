// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_DISPLAY_MODE_EVENT,
  DEFAULT_ASSISTANT_DISPLAY_MODE,
  readAssistantDisplayMode,
  setAssistantDisplayMode,
} from "@/lib/assistant-display-preferences";

const USER = "mgr-a";
const OTHER = "mgr-b";
const keyFor = (user: string) => `axis:assistant-display-mode:v1:${user}`;

// jsdom throws on native localStorage for opaque origins, so install a simple
// in-memory store on `window` (the code under test reads `window.localStorage`).
function installFakeStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

describe("assistant display preferences", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("defaults to the floating popup when nothing is stored", () => {
    expect(DEFAULT_ASSISTANT_DISPLAY_MODE).toBe("popup");
    expect(readAssistantDisplayMode(USER)).toBe("popup");
    expect(window.localStorage.getItem(keyFor(USER))).toBeNull();
  });

  it("persists an explicit switch to docked", () => {
    setAssistantDisplayMode(USER, "docked");
    expect(window.localStorage.getItem(keyFor(USER))).toBe("docked");
    expect(readAssistantDisplayMode(USER)).toBe("docked");
  });

  it("stores only overrides — going back to popup clears the key", () => {
    setAssistantDisplayMode(USER, "docked");
    setAssistantDisplayMode(USER, "popup");
    expect(window.localStorage.getItem(keyFor(USER))).toBeNull();
    expect(readAssistantDisplayMode(USER)).toBe("popup");
  });

  it("scopes the preference per manager", () => {
    setAssistantDisplayMode(USER, "docked");
    expect(readAssistantDisplayMode(OTHER)).toBe("popup");
  });

  it("falls back to popup for a missing user and for a corrupt stored value", () => {
    expect(readAssistantDisplayMode(null)).toBe("popup");
    expect(readAssistantDisplayMode(undefined)).toBe("popup");
    window.localStorage.setItem(keyFor(USER), "sidebar");
    expect(readAssistantDisplayMode(USER)).toBe("popup");
  });

  it("writes nothing for a signed-out user", () => {
    setAssistantDisplayMode(null, "docked");
    expect(window.localStorage.length).toBe(0);
  });

  it("notifies listeners on every write", () => {
    const seen = vi.fn();
    window.addEventListener(ASSISTANT_DISPLAY_MODE_EVENT, seen);
    setAssistantDisplayMode(USER, "docked");
    setAssistantDisplayMode(USER, "popup");
    window.removeEventListener(ASSISTANT_DISPLAY_MODE_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("silently no-ops when storage throws instead of breaking the portal", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(readAssistantDisplayMode(USER)).toBe("popup");
    expect(() => setAssistantDisplayMode(USER, "docked")).not.toThrow();
  });
});
