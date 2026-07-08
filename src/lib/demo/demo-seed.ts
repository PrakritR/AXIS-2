/**
 * Seeds the browser-local demo stores for the public `/demo` sandbox.
 *
 * Two modes (see `demo-guided.ts`):
 * - **idle** — rich portfolio (`buildDemoIdleSnapshot`), optionally overlaid from
 *   the canonical test accounts via `/api/demo/portal-snapshot`.
 * - **guided** — blank slate (`buildDemoBlankSnapshot`); autoplay creates data.
 *
 * Everything is written into each store's `seedDemo…` helper (never the server),
 * scoped to synthetic demo manager/resident ids. Real portal routes never call
 * these helpers — `isDemoModeActive()` gates every entry point.
 */
import { seedDemoHouseholdCharges } from "@/lib/household-charges";
import { seedDemoManagerApplicationRows } from "@/lib/manager-applications-storage";
import { seedDemoLeasePipeline } from "@/lib/lease-pipeline-storage";
import { seedDemoManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";
import { seedDemoWorkOrderBids } from "@/lib/work-order-bids-storage";
import { seedDemoVendorPayouts } from "@/lib/vendor-payouts-storage";
import { seedDemoManagerVendorRows } from "@/lib/manager-vendors-storage";
import { seedDemoManagerPromotionRows } from "@/lib/manager-promotions-storage";
import { seedDemoManagerOutgoingExpenses } from "@/lib/manager-outgoing-payments";
import { seedDemoServiceRequests } from "@/lib/service-requests-storage";
import {
  seedDemoInbox,
  MANAGER_INBOX_STORAGE_KEY,
  RESIDENT_INBOX_STORAGE_KEY,
  VENDOR_INBOX_STORAGE_KEY,
} from "@/lib/portal-inbox-storage";
import { seedDemoManagerProperties } from "@/lib/demo-property-pipeline";
import { seedDemoBugFeedback } from "@/lib/portal-bug-feedback";
import { seedDemoAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  managerPropertyAvailabilityStorageKey,
  seedDemoScheduleData,
} from "@/lib/demo-admin-scheduling";
import { seedDemoUploadedOwnLeases } from "@/lib/resident-lease-upload";
import {
  DEMO_RESIDENT_EMAIL,
  isDemoModeActive,
  resolveDemoManagerScopeUserId,
} from "@/lib/demo/demo-session";
import {
  getDemoGuidedState,
  hydrateDemoGuidedState,
  isGuidedDemoActive,
} from "@/lib/demo/demo-guided";
import {
  buildDemoBlankSnapshot,
  buildDemoGuidedSnapshot,
  buildDemoIdleSnapshot,
  type DemoDataSnapshot,
} from "@/lib/demo/demo-guided-data";

function applyDemoSnapshot(snapshot: DemoDataSnapshot): void {
  const managerScopeId = resolveDemoManagerScopeUserId();
  seedDemoManagerProperties(managerScopeId, snapshot.properties);
  seedDemoManagerApplicationRows(snapshot.applications, managerScopeId);
  seedDemoHouseholdCharges(snapshot.charges, snapshot.rentProfiles);
  seedDemoLeasePipeline(snapshot.leases, managerScopeId);

  const schedule = snapshot.schedule;
  seedDemoScheduleData({
    plannedEvents: schedule.plannedEvents,
    partnerInquiries: schedule.partnerInquiries,
    availabilityByStorageKey: Object.fromEntries(
      Object.entries(schedule.availabilityByPropertyId).map(([propertyId, slots]) => [
        managerPropertyAvailabilityStorageKey(managerScopeId, propertyId),
        slots,
      ]),
    ),
  });

  seedDemoUploadedOwnLeases(DEMO_RESIDENT_EMAIL, snapshot.residentUploads);
  seedDemoManagerWorkOrderRows(snapshot.workOrders);
  seedDemoWorkOrderBids(snapshot.workOrderBids);
  seedDemoVendorPayouts(snapshot.vendorPayouts);
  seedDemoManagerVendorRows(snapshot.vendors);
  seedDemoManagerPromotionRows(snapshot.promotions);
  seedDemoManagerOutgoingExpenses([]);
  seedDemoServiceRequests(snapshot.serviceRequests);
  seedDemoInbox(MANAGER_INBOX_STORAGE_KEY, snapshot.managerInbox);
  seedDemoInbox(RESIDENT_INBOX_STORAGE_KEY, snapshot.residentInbox);
  seedDemoInbox(VENDOR_INBOX_STORAGE_KEY, snapshot.vendorInbox);
  seedDemoAdminInbox(snapshot.adminInbox);
  seedDemoBugFeedback(snapshot.bugFeedback);
}

/** Resolve which snapshot to seed based on guided tour state. */
export function resolveDemoSnapshot(): DemoDataSnapshot {
  hydrateDemoGuidedState();
  const { mode, step } = getDemoGuidedState();
  if (mode === "guided" && step > 0) {
    return buildDemoGuidedSnapshot(step);
  }
  return buildDemoIdleSnapshot();
}

/**
 * Reset every demo store to idle or guided snapshot. Runs on each `/demo` mount
 * and whenever the guided step changes.
 */
export function seedDemoPortalData(): void {
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  applyDemoSnapshot(resolveDemoSnapshot());
}

/** Re-seed after a guided step transition (same guards as `seedDemoPortalData`). */
export function reseedDemoPortalForGuidedStep(): void {
  if (typeof window === "undefined" || !isDemoModeActive() || !isGuidedDemoActive()) return;
  applyDemoSnapshot(buildDemoGuidedSnapshot(getDemoGuidedState().step));
}

/** Force idle rich portfolio (exiting guided tour). */
export function seedDemoIdleData(): void {
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  applyDemoSnapshot(buildDemoIdleSnapshot());
}

/** Clear every demo store for guided tour autoplay (blank slate). */
export function seedDemoBlankData(): void {
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  applyDemoSnapshot(buildDemoBlankSnapshot());
}

/** Apply a partial snapshot (segment demos). */
export function applyDemoSnapshotForSegment(snapshot: DemoDataSnapshot): void {
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  applyDemoSnapshot(snapshot);
}

/**
 * Idle `/demo` mount: prefer DB mirror when available, else static demo-data.
 */
export async function seedDemoPortalIdleData(): Promise<void> {
  if (typeof window === "undefined" || !isDemoModeActive()) return;
  hydrateDemoGuidedState();
  const { mode, step } = getDemoGuidedState();
  if (mode === "guided" && step > 0) {
    applyDemoSnapshot(buildDemoGuidedSnapshot(step));
    return;
  }
  const mirrored = await seedDemoPortalDataFromMirror();
  if (!mirrored) {
    applyDemoSnapshot(buildDemoIdleSnapshot());
  }
}

/**
 * Overlay a read-only mirror from the canonical test accounts (production → demo).
 * Falls back silently — use `seedDemoPortalIdleData` for mirror-first idle seeding.
 */
export async function seedDemoPortalDataFromMirror(): Promise<boolean> {
  if (typeof window === "undefined" || !isDemoModeActive()) return false;
  hydrateDemoGuidedState();
  if (isGuidedDemoActive()) return false;
  try {
    const res = await fetch("/api/demo/portal-snapshot", { credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json()) as { source?: string; snapshot?: DemoDataSnapshot };
    if (body.source !== "mirror" || !body.snapshot) return false;
    applyDemoSnapshot(body.snapshot);
    return true;
  } catch {
    return false;
  }
}
