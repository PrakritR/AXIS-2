import { buildDemoPropertyCreationSubmission } from "@/lib/demo/demo-listing-autofill";
import { buildDemoBlankSnapshot } from "@/lib/demo/demo-guided-data";
import type { DemoSegment } from "@/lib/demo/demo-segments";
import {
  approvePendingManagerProperty,
  PROPERTY_PIPELINE_EVENT,
  submitManagerPendingPropertyToServer,
} from "@/lib/demo-property-pipeline";
import { isDemoModeActive, resolveDemoManagerScopeUserId } from "@/lib/demo/demo-session";
import { applyDemoSnapshotForSegment } from "@/lib/demo/demo-seed";
import { createDemoMaintenanceWorkOrder } from "@/lib/demo/demo-work-order-actions";

/** Programmatically list a property for leasing / work-order segments (no wizard UI). */
export async function prepareDemoListedProperty(): Promise<string | null> {
  if (!isDemoModeActive()) return null;
  const managerUserId = resolveDemoManagerScopeUserId();
  const submission = buildDemoPropertyCreationSubmission();
  const pendingId = await submitManagerPendingPropertyToServer(submission, managerUserId);
  if (!pendingId) return null;
  const listed = approvePendingManagerProperty(pendingId);
  if (listed?.id) {
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  }
  return listed?.id ?? null;
}

/**
 * Seed starting data for a segment before autoplay. Every segment starts from a
 * BLANK sandbox — there is no static fictional portfolio (see
 * `demo-guided-data.ts`) — and then builds exactly what its story needs through
 * the same code paths the real portal uses. That is also why the offered
 * segments (`DEMO_SEGMENT_LABELS`) are only the self-building ones: a
 * walkthrough that operates on pre-existing rows would have nothing to click.
 */
export async function prepareDemoSegment(segment: DemoSegment): Promise<{ propertyId: string | null }> {
  if (!isDemoModeActive()) return { propertyId: null };

  applyDemoSnapshotForSegment(buildDemoBlankSnapshot());

  if (segment === "leasing" || segment === "applications" || segment === "promotion") {
    return { propertyId: await prepareDemoListedProperty() };
  }

  if (segment === "work_orders") {
    const propertyId = await prepareDemoListedProperty();
    if (propertyId) {
      createDemoMaintenanceWorkOrder(propertyId);
    }
    return { propertyId };
  }

  // `overall` creates its own property through the listing wizard on step 1.
  return { propertyId: null };
}
