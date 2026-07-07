import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceGuidedDemoStep,
  DEMO_GUIDED_STORAGE_KEY,
  exitGuidedDemoTour,
  getDemoGuidedState,
  getGuidedDemoStep,
  GUIDED_DEMO_STEP_COUNT,
  hydrateDemoGuidedState,
  isGuidedDemoActive,
  isGuidedVendorUnlocked,
  startGuidedDemoTour,
} from "@/lib/demo/demo-guided";
import {
  buildDemoGuidedDataThrough,
  buildDemoGuidedSnapshot,
  buildDemoIdleSnapshot,
} from "@/lib/demo/demo-guided-data";

const demoPath = "/demo";

describe("demo-guided state machine", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { pathname: demoPath },
      localStorage: {
        store: {} as Record<string, string>,
        getItem(key: string) {
          return this.store[key] ?? null;
        },
        setItem(key: string, value: string) {
          this.store[key] = value;
        },
        removeItem(key: string) {
          delete this.store[key];
        },
      },
    });
    exitGuidedDemoTour();
    hydrateDemoGuidedState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts idle with rich data available via idle snapshot", () => {
    expect(isGuidedDemoActive()).toBe(false);
    expect(getGuidedDemoStep()).toBe(0);
    expect(buildDemoIdleSnapshot().properties.length).toBeGreaterThan(1);
  });

  it("starts guided tour at step 1 with empty portfolio", () => {
    startGuidedDemoTour();
    expect(isGuidedDemoActive()).toBe(true);
    expect(getGuidedDemoStep()).toBe(1);
    const snap = buildDemoGuidedSnapshot(1);
    expect(snap.properties).toHaveLength(0);
    expect(snap.applications).toHaveLength(0);
  });

  it("advances steps cumulatively through step 3", () => {
    startGuidedDemoTour();
    expect(buildDemoGuidedSnapshot(1).properties).toHaveLength(0);

    advanceGuidedDemoStep();
    expect(getGuidedDemoStep()).toBe(2);
    expect(buildDemoGuidedSnapshot(2).properties).toHaveLength(1);
    expect(buildDemoGuidedSnapshot(2).applications).toHaveLength(0);

    advanceGuidedDemoStep();
    expect(getGuidedDemoStep()).toBe(3);
    expect(buildDemoGuidedSnapshot(3).applications).toHaveLength(1);
    expect(buildDemoGuidedSnapshot(3).applications[0]?.bucket).toBe("pending");

    advanceGuidedDemoStep();
    expect(getGuidedDemoStep()).toBe(4);
    expect(buildDemoGuidedSnapshot(4).applications[0]?.bucket).toBe("approved");
  });

  it("persists guided state to localStorage only on /demo", () => {
    startGuidedDemoTour();
    const raw = window.localStorage.getItem(DEMO_GUIDED_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).mode).toBe("guided");
  });

  it("exits guided tour and clears storage", () => {
    startGuidedDemoTour();
    advanceGuidedDemoStep();
    exitGuidedDemoTour();
    expect(isGuidedDemoActive()).toBe(false);
    expect(window.localStorage.getItem(DEMO_GUIDED_STORAGE_KEY)).toBeNull();
    expect(getDemoGuidedState().mode).toBe("idle");
  });

  it("finishes tour after step 11", () => {
    startGuidedDemoTour();
    for (let i = 0; i < GUIDED_DEMO_STEP_COUNT; i += 1) {
      advanceGuidedDemoStep();
    }
    expect(isGuidedDemoActive()).toBe(false);
    expect(getGuidedDemoStep()).toBe(0);
  });

  it("locks vendor persona until step 10 in guided mode", () => {
    startGuidedDemoTour();
    expect(isGuidedVendorUnlocked()).toBe(false);
    for (let step = 1; step < 10; step += 1) {
      if (step > 1) advanceGuidedDemoStep();
      expect(isGuidedVendorUnlocked()).toBe(false);
    }
    advanceGuidedDemoStep();
    expect(getGuidedDemoStep()).toBe(10);
    expect(isGuidedVendorUnlocked()).toBe(true);
  });

  it("step 10 includes vendor pending payment work order", () => {
    const snap = buildDemoGuidedDataThrough(10);
    const pending = snap.workOrders.find((w) => w.title === "Mini-split head cleaning");
    expect(pending?.vendorCostCents).toBe(17500);
    expect(pending?.automationStatus).toBe("vendor_marked_done");
    expect(snap.vendorInbox.length).toBeGreaterThan(0);
  });
});

describe("demo-guided isolation", () => {
  it("does not persist when not on /demo path", () => {
    vi.stubGlobal("window", {
      location: { pathname: "/portal" },
      localStorage: {
        store: {} as Record<string, string>,
        getItem(key: string) {
          return this.store[key] ?? null;
        },
        setItem(key: string, value: string) {
          this.store[key] = value;
        },
        removeItem(key: string) {
          delete this.store[key];
        },
      },
    });
    hydrateDemoGuidedState();
    startGuidedDemoTour();
    expect(window.localStorage.getItem(DEMO_GUIDED_STORAGE_KEY)).toBeNull();
    vi.unstubAllGlobals();
  });
});
