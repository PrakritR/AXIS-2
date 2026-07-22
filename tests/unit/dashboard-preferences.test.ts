// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PREFS_EVENT,
  MANAGER_DASHBOARD_SECTIONS,
  defaultDashboardVisibility,
  readDashboardVisibility,
  resetDashboardVisibility,
  setDashboardSectionVisibility,
} from "@/lib/dashboard-preferences";

const USER = "user-a";
const OTHER = "user-b";
const keyFor = (user: string) => `axis:manager-dashboard-prefs:v1:${user}`;

// jsdom throws on native localStorage for opaque origins, so install a simple
// in-memory store on `window` (the code under test reads `window.localStorage`).
function installFakeStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: fake, configurable: true });
}

describe("dashboard preferences", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("defaults every section to visible when nothing is stored", () => {
    const vis = readDashboardVisibility(USER);
    for (const section of MANAGER_DASHBOARD_SECTIONS) {
      expect(vis[section.id]).toBe(true);
    }
    expect(vis).toEqual(defaultDashboardVisibility());
  });

  it("hides a single section and leaves the rest visible", () => {
    setDashboardSectionVisibility(USER, "cashflow", false);
    const vis = readDashboardVisibility(USER);
    expect(vis.cashflow).toBe(false);
    expect(vis.applications).toBe(true);
    expect(vis.inbox).toBe(true);
  });

  it("persists only overrides, and drops the override when set back to default", () => {
    setDashboardSectionVisibility(USER, "cashflow", false);
    expect(JSON.parse(window.localStorage.getItem(keyFor(USER))!)).toEqual({ cashflow: false });

    // Re-showing it (its default) removes the override entirely, and since it
    // was the only override the whole key is cleared.
    setDashboardSectionVisibility(USER, "cashflow", true);
    expect(window.localStorage.getItem(keyFor(USER))).toBeNull();
    expect(readDashboardVisibility(USER).cashflow).toBe(true);
  });

  it("scopes preferences per user", () => {
    setDashboardSectionVisibility(USER, "inbox", false);
    expect(readDashboardVisibility(USER).inbox).toBe(false);
    expect(readDashboardVisibility(OTHER).inbox).toBe(true);
  });

  it("reset restores defaults and clears storage", () => {
    setDashboardSectionVisibility(USER, "cashflow", false);
    setDashboardSectionVisibility(USER, "services", false);
    resetDashboardVisibility(USER);
    expect(readDashboardVisibility(USER)).toEqual(defaultDashboardVisibility());
    expect(window.localStorage.getItem(keyFor(USER))).toBeNull();
  });

  it("dispatches the change event on write and reset", () => {
    const handler = vi.fn();
    window.addEventListener(DASHBOARD_PREFS_EVENT, handler);
    setDashboardSectionVisibility(USER, "cashflow", false);
    resetDashboardVisibility(USER);
    window.removeEventListener(DASHBOARD_PREFS_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores a null user id without throwing", () => {
    expect(() => setDashboardSectionVisibility(null, "cashflow", false)).not.toThrow();
    expect(readDashboardVisibility(null)).toEqual(defaultDashboardVisibility());
  });

  it("ignores corrupt stored JSON and falls back to defaults", () => {
    // Directly poison the store for USER's key.
    window.localStorage.setItem("axis:manager-dashboard-prefs:v1:" + USER, "not json");
    expect(readDashboardVisibility(USER)).toEqual(defaultDashboardVisibility());
  });
});
