import { isDemoModeActive } from "@/lib/demo/demo-session";
import { demoVendorPayouts } from "@/lib/demo/demo-data";
import type { VendorPayout } from "@/lib/vendor-payouts";

export const VENDOR_PAYOUTS_EVENT = "axis:vendor-payouts";
const VENDOR_PAYOUTS_SESSION_KEY = "axis:vendor-payouts:v1";

let memoryPayouts: VendorPayout[] = [];

function canUseStorage() {
  return typeof window !== "undefined";
}

function hydratePayoutsFromSession() {
  if (!canUseStorage() || memoryPayouts.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(VENDOR_PAYOUTS_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as VendorPayout[];
    if (!Array.isArray(parsed)) return;
    memoryPayouts = parsed;
  } catch {
    /* ignore */
  }
}

function persistPayoutsToSession(rows: VendorPayout[]) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(VENDOR_PAYOUTS_SESSION_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(VENDOR_PAYOUTS_EVENT));
}

/** Demo seed: overwrite local payout rows (no server mirror). */
export function seedDemoVendorPayouts(payouts: VendorPayout[]): void {
  if (!canUseStorage()) return;
  memoryPayouts = payouts;
  persistPayoutsToSession(payouts);
  emit();
}

export function readVendorPayouts(): VendorPayout[] {
  hydratePayoutsFromSession();
  if (memoryPayouts.length > 0) return memoryPayouts;
  if (isDemoModeActive()) return demoVendorPayouts();
  return [];
}
