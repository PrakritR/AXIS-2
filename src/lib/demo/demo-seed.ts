/**
 * Seeds the browser-local demo stores for the public `/demo` sandbox.
 *
 * Two modes (see `demo-guided.ts`):
 * - **idle** — empty portfolio (`buildDemoIdleSnapshot`).
 * - **guided** — cumulative story data through the current step (`buildDemoGuidedSnapshot`).
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
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_EMAIL,
  isDemoModeActive,
} from "@/lib/demo/demo-session";
import {
  getDemoGuidedState,
  hydrateDemoGuidedState,
  isGuidedDemoActive,
} from "@/lib/demo/demo-guided";
import {
  buildDemoGuidedSnapshot,
  buildDemoIdleSnapshot,
  type DemoDataSnapshot,
} from "@/lib/demo/demo-guided-data";

function applyDemoSnapshot(snapshot: DemoDataSnapshot): void {
  seedDemoManagerProperties(DEMO_MANAGER_USER_ID, snapshot.properties);
  seedDemoManagerApplicationRows(snapshot.applications, DEMO_MANAGER_USER_ID);
  seedDemoHouseholdCharges(snapshot.charges, snapshot.rentProfiles);
  seedDemoLeasePipeline(snapshot.leases, DEMO_MANAGER_USER_ID);

  const schedule = snapshot.schedule;
  seedDemoScheduleData({
    plannedEvents: schedule.plannedEvents,
    partnerInquiries: schedule.partnerInquiries,
    availabilityByStorageKey: Object.fromEntries(
      Object.entries(schedule.availabilityByPropertyId).map(([propertyId, slots]) => [
        managerPropertyAvailabilityStorageKey(DEMO_MANAGER_USER_ID, propertyId),
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
