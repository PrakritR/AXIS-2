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
import { seedDemoServiceRequests } from "@/lib/service-requests-storage";
import { seedDemoInbox, MANAGER_INBOX_STORAGE_KEY, RESIDENT_INBOX_STORAGE_KEY } from "@/lib/portal-inbox-storage";
import { seedDemoManagerProperties } from "@/lib/demo-property-pipeline";
import { seedDemoBugFeedback } from "@/lib/portal-bug-feedback";
import { seedDemoAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_EMAIL,
  DEMO_RESIDENT_USER_ID,
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
  demoResidentInbox,
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

  const applications = demoApplications();
  // Seed under the manager scope (manager/admin view) and the resident scope (so
  // the resident's own application is visible in the resident portal), then
  // restore the manager scope as active for subsequent reads.
  seedDemoManagerApplicationRows(applications, DEMO_MANAGER_USER_ID);
  seedDemoManagerApplicationRows(
    applications.filter((a) => a.email?.toLowerCase() === DEMO_RESIDENT_EMAIL),
    DEMO_RESIDENT_USER_ID,
  );
  seedDemoManagerApplicationRows(applications, DEMO_MANAGER_USER_ID);

  // Seed explicit charges only — no recurring rent profiles, which would
  // auto-generate back-dated monthly charges and inflate the overdue count.
  seedDemoHouseholdCharges(demoCharges());
  seedDemoLeasePipeline(demoLeases(), DEMO_MANAGER_USER_ID);
  seedDemoManagerWorkOrderRows(demoWorkOrders());
  seedDemoManagerVendorRows(demoVendors());
  seedDemoServiceRequests(demoServiceRequests());
  seedDemoInbox(MANAGER_INBOX_STORAGE_KEY, demoManagerInbox());
  seedDemoInbox(RESIDENT_INBOX_STORAGE_KEY, demoResidentInbox());
  seedDemoAdminInbox(demoAdminInbox());
  seedDemoBugFeedback(demoBugFeedback());
}
