/**
 * Seeds the browser-local demo stores for the public `/demo` sandbox from the
 * shared fictional dataset in `demo-data.ts`. Everything is written straight into
 * each store's dedicated `seedDemo…` helper (never the server), scoped to the
 * synthetic demo manager/resident ids.
 *
 * The demo is ephemeral: this force-resets every store to the seed on each mount
 * (every page load and every client-side navigation back to `/demo`), so nothing
 * a visitor does in the sandbox survives a refresh. Each `seedDemo…` helper does
 * a full overwrite (not a merge), which discards any edits/additions/deletes the
 * visitor made in the previous session.
 */
import { seedDemoHouseholdCharges } from "@/lib/household-charges";
import { seedDemoManagerApplicationRows } from "@/lib/manager-applications-storage";
import { seedDemoLeasePipeline } from "@/lib/lease-pipeline-storage";
import { seedDemoManagerWorkOrderRows } from "@/lib/manager-work-orders-storage";
import { seedDemoManagerVendorRows } from "@/lib/manager-vendors-storage";
import { seedDemoManagerPromotionRows } from "@/lib/manager-promotions-storage";
import { seedDemoServiceRequests } from "@/lib/service-requests-storage";
import { seedDemoInbox, MANAGER_INBOX_STORAGE_KEY, RESIDENT_INBOX_STORAGE_KEY } from "@/lib/portal-inbox-storage";
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
  demoAdminInbox,
  demoApplications,
  demoBugFeedback,
  demoCharges,
  demoLeases,
  demoManagerInbox,
  demoProperties,
  demoPromotions,
  demoResidentInbox,
  demoResidentUploads,
  demoSchedule,
  demoServiceRequests,
  demoVendors,
  demoWorkOrders,
} from "@/lib/demo/demo-data";

/**
 * Reset every demo store to the seed. Runs on each `/demo` mount so the sandbox
 * always starts fresh; only runs client-side on the `/demo` route.
 */
export function seedDemoPortalData(): void {
  if (typeof window === "undefined" || !isDemoModeActive()) return;

  seedDemoManagerProperties(DEMO_MANAGER_USER_ID, demoProperties());

  // In demo mode the application and lease stores collapse every scope onto
  // the shared session key, so ONE seed call is read by both the manager and
  // resident panels — and a signature written from either role is the same
  // object the other role sees.
  seedDemoManagerApplicationRows(demoApplications(), DEMO_MANAGER_USER_ID);

  // Seed explicit charges only — no recurring rent profiles, which would
  // auto-generate back-dated monthly charges and inflate the overdue count.
  seedDemoHouseholdCharges(demoCharges());
  // The demo resident's lease seeds UNSIGNED so a visitor can play the whole
  // signing flow (resident signs → manager countersigns); a page refresh
  // re-runs this seed and resets it. Full overwrite discards any signatures
  // from the previous session.
  seedDemoLeasePipeline(demoLeases(), DEMO_MANAGER_USER_ID);

  // Calendar: confirmed tours, pending tour requests, and weekday availability
  // for every demo property.
  const schedule = demoSchedule();
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

  // Resident Documents › Other: a viewable, downloadable sample document.
  seedDemoUploadedOwnLeases(DEMO_RESIDENT_EMAIL, demoResidentUploads());
  seedDemoManagerWorkOrderRows(demoWorkOrders());
  seedDemoManagerVendorRows(demoVendors());
  seedDemoManagerPromotionRows(demoPromotions());
  seedDemoServiceRequests(demoServiceRequests());
  seedDemoInbox(MANAGER_INBOX_STORAGE_KEY, demoManagerInbox());
  seedDemoInbox(RESIDENT_INBOX_STORAGE_KEY, demoResidentInbox());
  seedDemoAdminInbox(demoAdminInbox());
  seedDemoBugFeedback(demoBugFeedback());
}
