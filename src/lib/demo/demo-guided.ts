/**
 * Guided demo tour state for `/demo`.
 *
 * Segments: overall (full funnel), leasing, payments, work orders.
 */

import type { DemoSegment } from "@/lib/demo/demo-segments";
import {
  getSegmentStepDef,
  segmentStepCount,
  type SegmentStepDef,
} from "@/lib/demo/demo-segments";
import { isDemoModeActive } from "@/lib/demo/demo-session";

export type { DemoSegment } from "@/lib/demo/demo-segments";
export { DEMO_SEGMENT_LABELS, GUIDED_STEPS_BY_SEGMENT } from "@/lib/demo/demo-segments";

export const DEMO_GUIDED_STORAGE_KEY = "axis_demo_guided_state_v1";

export type DemoGuidedMode = "idle" | "guided";

/** 1-based step index; 0 means guided mode not started yet. */
export type GuidedDemoStep = number;

export type GuidedStepDef = SegmentStepDef;

/** @deprecated Use segmentStepCount(getDemoSegment()) */
export const GUIDED_DEMO_STEP_COUNT = 8;

/** @deprecated Use GUIDED_STEPS_BY_SEGMENT.overall */
export const GUIDED_DEMO_STEPS = getSegmentStepDef("overall", 1)
  ? Array.from({ length: segmentStepCount("overall") }, (_, i) => getSegmentStepDef("overall", i + 1)!)
  : [];

export type DemoGuidedPersisted = {
  mode: DemoGuidedMode;
  step: GuidedDemoStep;
  segment: DemoSegment;
};

const DEFAULT_STATE: DemoGuidedPersisted = { mode: "idle", step: 0, segment: "overall" };

let memoryState: DemoGuidedPersisted = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function clampStep(step: number, segment: DemoSegment): GuidedDemoStep {
  const max = segmentStepCount(segment);
  return Math.max(0, Math.min(max, Math.floor(step)));
}

function readPersisted(): DemoGuidedPersisted {
  if (typeof window === "undefined" || !isDemoModeActive()) return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(DEMO_GUIDED_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<DemoGuidedPersisted & { paused?: boolean }>;
    const segment: DemoSegment =
      parsed.segment === "applications" ||
      parsed.segment === "leasing" ||
      parsed.segment === "inbox" ||
      parsed.segment === "promotion" ||
      parsed.segment === "payments" ||
      parsed.segment === "work_orders"
        ? parsed.segment
        : "overall";
    return {
      mode: parsed.mode === "guided" ? "guided" : "idle",
      step: clampStep(parsed.step ?? 0, segment),
      segment,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writePersisted(state: DemoGuidedPersisted) {
  memoryState = state;
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  try {
    if (state.mode === "idle" && state.step === 0) {
      window.localStorage.removeItem(DEMO_GUIDED_STORAGE_KEY);
    } else {
      window.localStorage.setItem(DEMO_GUIDED_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore quota */
  }
  emit();
}

export function hydrateDemoGuidedState(): DemoGuidedPersisted {
  if (typeof window !== "undefined" && isDemoModeActive()) {
    try {
      window.localStorage.removeItem(DEMO_GUIDED_STORAGE_KEY);
    } catch {
      /* ignore quota */
    }
  }
  memoryState = { ...DEFAULT_STATE };
  return memoryState;
}

export function getDemoGuidedState(): DemoGuidedPersisted {
  if (typeof window === "undefined") return memoryState;
  return memoryState;
}

export function getDemoGuidedServerSnapshot(): DemoGuidedPersisted {
  return DEFAULT_STATE;
}

export function getDemoSegment(): DemoSegment {
  return getDemoGuidedState().segment;
}

export function isGuidedDemoActive(): boolean {
  return getDemoGuidedState().mode === "guided" && getDemoGuidedState().step > 0;
}

export function getGuidedDemoStep(): GuidedDemoStep {
  const { mode, step } = getDemoGuidedState();
  return mode === "guided" ? step : 0;
}

export function getGuidedStepDef(step: GuidedDemoStep): GuidedStepDef | null {
  const segment = getDemoSegment();
  return getSegmentStepDef(segment, step);
}

export function subscribeDemoGuidedState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startGuidedDemoTour(segment: DemoSegment = "overall"): void {
  writePersisted({ mode: "guided", step: 1, segment });
}

export function exitGuidedDemoTour(): void {
  writePersisted({ ...DEFAULT_STATE });
}

/** End autoplay without clearing portal data — visitor keeps the created listing. */
export function finishGuidedDemoTour(): void {
  writePersisted({ ...DEFAULT_STATE });
}

export function advanceGuidedDemoStep(): boolean {
  finishGuidedDemoTour();
  return false;
}

export function setGuidedDemoStep(step: GuidedDemoStep): void {
  const state = getDemoGuidedState();
  if (step === 0) {
    writePersisted({ ...DEFAULT_STATE });
    return;
  }
  // Only an active tour may advance its step: an in-flight autoplay chain that
  // outlives "Exit tour" must not resurrect guided mode by writing a step.
  if (state.mode !== "guided") return;
  writePersisted({ mode: "guided", step: clampStep(step, state.segment), segment: state.segment });
}

/** Vendor is always available in the simplified demo. */
export function isGuidedVendorUnlocked(): boolean {
  return true;
}

/** @deprecated Autoplay runs continuously — no pause. */
export function pauseGuidedDemoTour(): void {
  /* no-op */
}

/** @deprecated Autoplay runs continuously — no pause. */
export function resumeGuidedDemoTour(): void {
  /* no-op */
}
