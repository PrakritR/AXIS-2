/**
 * Guided demo tour state for `/demo`.
 *
 * Two modes:
 * - **idle** — rich pre-filled portfolio (explorable sandbox).
 * - **guided** — starts empty, each step patches in-memory demo stores.
 *
 * State persists in localStorage (`axis_demo_guided_state_v1`) only while
 * `isDemoModeActive()` — real portal routes never read or write this key.
 */

import { isDemoModeActive } from "@/lib/demo/demo-session";

export const DEMO_GUIDED_STORAGE_KEY = "axis_demo_guided_state_v1";

export type DemoGuidedMode = "idle" | "guided";

/** 1-based step index; 0 means guided mode not started yet. */
export type GuidedDemoStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export const GUIDED_DEMO_STEP_COUNT = 11;

export type GuidedStepDef = {
  step: GuidedDemoStep;
  title: string;
  hint: string;
  role: "manager" | "resident" | "vendor";
  section: string;
  tab?: string | null;
};

export const GUIDED_DEMO_STEPS: GuidedStepDef[] = [
  {
    step: 1,
    title: "Create a property",
    hint: "Add your first listing — or click Next step to see it appear.",
    role: "manager",
    section: "properties",
  },
  {
    step: 2,
    title: "Applicant applies",
    hint: "Jordan Lee submits an application for The Pioneer.",
    role: "resident",
    section: "applications",
  },
  {
    step: 3,
    title: "Approve applicant",
    hint: "Review and approve Jordan's application in the manager portal.",
    role: "manager",
    section: "applications",
  },
  {
    step: 4,
    title: "Resident move-in & lease",
    hint: "Jordan reviews move-in details and signs the lease.",
    role: "resident",
    section: "lease",
  },
  {
    step: 5,
    title: "Manager countersigns",
    hint: "Alex countersigns the lease to complete the agreement.",
    role: "manager",
    section: "leases",
  },
  {
    step: 6,
    title: "Resident pays rent",
    hint: "Jordan pays the first month's rent through the resident portal.",
    role: "resident",
    section: "payments",
  },
  {
    step: 7,
    title: "Payment recorded",
    hint: "The manager sees the rent payment marked paid.",
    role: "manager",
    section: "payments",
  },
  {
    step: 8,
    title: "Work order filed",
    hint: "Jordan reports a maintenance issue from the resident portal.",
    role: "resident",
    section: "services",
    tab: "work-orders",
  },
  {
    step: 9,
    title: "Assign vendor",
    hint: "The manager reviews the work order and sends it to a vendor.",
    role: "manager",
    section: "services",
    tab: "work-orders",
  },
  {
    step: 10,
    title: "Vendor workflow",
    hint: "Cascade Mechanical bids, completes work, and awaits payout approval.",
    role: "vendor",
    section: "payments",
  },
  {
    step: 11,
    title: "Documents & finances",
    hint: "Leasing documents, expense reports, and the full portfolio picture.",
    role: "manager",
    section: "documents",
  },
];

export type DemoGuidedPersisted = {
  mode: DemoGuidedMode;
  step: GuidedDemoStep;
  paused: boolean;
};

const DEFAULT_STATE: DemoGuidedPersisted = { mode: "idle", step: 0, paused: false };

let memoryState: DemoGuidedPersisted = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function clampStep(step: number): GuidedDemoStep {
  const n = Math.max(0, Math.min(GUIDED_DEMO_STEP_COUNT, Math.floor(step)));
  return n as GuidedDemoStep;
}

function readPersisted(): DemoGuidedPersisted {
  if (typeof window === "undefined" || !isDemoModeActive()) return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(DEMO_GUIDED_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<DemoGuidedPersisted>;
    return {
      mode: parsed.mode === "guided" ? "guided" : "idle",
      step: clampStep(parsed.step ?? 0),
      paused: Boolean(parsed.paused),
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

/** Hydrate in-memory state from localStorage (call once on `/demo` mount). */
export function hydrateDemoGuidedState(): DemoGuidedPersisted {
  memoryState = readPersisted();
  return memoryState;
}

export function getDemoGuidedState(): DemoGuidedPersisted {
  if (typeof window === "undefined") return memoryState;
  return memoryState;
}

export function isGuidedDemoActive(): boolean {
  return getDemoGuidedState().mode === "guided" && getDemoGuidedState().step > 0;
}

export function getGuidedDemoStep(): GuidedDemoStep {
  const { mode, step } = getDemoGuidedState();
  return mode === "guided" ? step : 0;
}

export function getGuidedStepDef(step: GuidedDemoStep): GuidedStepDef | null {
  return GUIDED_DEMO_STEPS.find((s) => s.step === step) ?? null;
}

export function subscribeDemoGuidedState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Enter guided tour at step 1 with empty portfolio. */
export function startGuidedDemoTour(): void {
  writePersisted({ mode: "guided", step: 1, paused: false });
}

/** Leave guided tour and return to idle (rich) demo data. */
export function exitGuidedDemoTour(): void {
  writePersisted({ ...DEFAULT_STATE });
}

/** Pause auto-navigation between steps (manual advance only). */
export function pauseGuidedDemoTour(): void {
  const cur = getDemoGuidedState();
  if (cur.mode !== "guided") return;
  writePersisted({ ...cur, paused: true });
}

export function resumeGuidedDemoTour(): void {
  const cur = getDemoGuidedState();
  if (cur.mode !== "guided") return;
  writePersisted({ ...cur, paused: false });
}

/** Advance to the next step, or finish the tour at step 11. */
export function advanceGuidedDemoStep(): boolean {
  const cur = getDemoGuidedState();
  if (cur.mode !== "guided") return false;
  if (cur.step >= GUIDED_DEMO_STEP_COUNT) {
    writePersisted({ mode: "idle", step: 0, paused: false });
    return false;
  }
  writePersisted({ mode: "guided", step: clampStep(cur.step + 1), paused: false });
  return true;
}

/** Jump to a specific step (for restart). */
export function setGuidedDemoStep(step: GuidedDemoStep): void {
  const cur = getDemoGuidedState();
  if (step === 0) {
    writePersisted({ ...DEFAULT_STATE });
    return;
  }
  writePersisted({ mode: "guided", step: clampStep(step), paused: cur.paused });
}

/** Vendor persona is only meaningful from step 10 onward in the guided story. */
export function isGuidedVendorUnlocked(): boolean {
  if (!isGuidedDemoActive()) return true;
  return getGuidedDemoStep() >= 10;
}
