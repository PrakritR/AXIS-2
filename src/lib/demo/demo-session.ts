/**
 * Client-side demo mode for the public `/demo` sandbox.
 *
 * The `/demo` route reuses the REAL portal panels signed-out. To make those
 * panels render rich data (most scope their reads by a manager/resident id), the
 * demo supplies a fixed, synthetic session per role instead of the null
 * signed-out session. Nothing here touches the network or a real account: the
 * ids are made-up scope keys, and every store the panels read is seeded locally
 * (see `demo-seed.ts`). The `@axis.local` emails are already treated as demo
 * addresses by the agent's send path, so they can never trigger a real email.
 *
 * `isDemoModeActive()` is derived from the pathname so the demo session is on
 * exactly and only under `/demo` — there is no ordering race with panel mount
 * effects, and it can never leak into a real signed-in portal session.
 */

export type DemoPortalRole = "manager" | "resident" | "vendor";

export const DEMO_MANAGER_USER_ID = "demo-manager";
export const DEMO_RESIDENT_USER_ID = "demo-resident";
export const DEMO_VENDOR_USER_ID = "demo-vendor";
export const DEMO_MANAGER_EMAIL = "alex.morgan@axis.local";
export const DEMO_RESIDENT_EMAIL = "jordan.lee@axis.local";
export const DEMO_VENDOR_EMAIL = "cascade.mechanical@axis.local";
export const DEMO_MANAGER_NAME = "Alex Morgan";
export const DEMO_RESIDENT_NAME = "Jordan Lee";
export const DEMO_VENDOR_NAME = "Cascade Mechanical";

export type DemoSessionSnapshot = { userId: string | null; email: string | null; ready: boolean };

/** True when the browser is on the public demo sandbox. */
export function isDemoModeActive(): boolean {
  return typeof window !== "undefined" && Boolean(window.location?.pathname?.startsWith("/demo"));
}

/**
 * Window event a reused portal panel dispatches (instead of a real router push)
 * when it wants to navigate while inside the demo sandbox. `DemoPortalShell`
 * listens for it and translates the target href into an in-demo section switch,
 * so programmatic navigations never escape to a real auth-gated route.
 */
export const DEMO_NAVIGATE_EVENT = "axis-demo:navigate";

let role: DemoPortalRole = "manager";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getDemoRole(): DemoPortalRole {
  return role;
}

export function setDemoRole(next: DemoPortalRole) {
  if (role === next) return;
  role = next;
  emit();
}

export function subscribeDemoRole(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The synthetic session the portal hooks report for the active demo role. */
export function demoSessionForRole(r: DemoPortalRole): DemoSessionSnapshot {
  if (r === "resident") {
    return { userId: DEMO_RESIDENT_USER_ID, email: DEMO_RESIDENT_EMAIL, ready: true };
  }
  if (r === "vendor") {
    return { userId: DEMO_VENDOR_USER_ID, email: DEMO_VENDOR_EMAIL, ready: true };
  }
  // The manager view uses the manager-scoped demo account so seeded manager
  // data (charges, applications, leases…) is visible.
  return { userId: DEMO_MANAGER_USER_ID, email: DEMO_MANAGER_EMAIL, ready: true };
}

/** Current demo session snapshot (role-aware). */
export function getDemoSessionSnapshot(): DemoSessionSnapshot {
  return demoSessionForRole(role);
}
