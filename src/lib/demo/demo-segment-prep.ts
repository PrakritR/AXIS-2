import { buildDemoPropertyCreationSubmission } from "@/lib/demo/demo-listing-autofill";
import { buildDemoIdleSnapshot } from "@/lib/demo/demo-guided-data";
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
 * Seed starting data for a segment before autoplay. Every segment starts from
 * the SAME rich idle portfolio the interactive demo shows — so the tour, the
 * idle demo, and the post-tour state all display one consistent dataset — plus
 * a freshly listed property for the flows that need one to operate on.
 */
export async function prepareDemoSegment(segment: DemoSegment): Promise<{ propertyId: string | null }> {
  if (!isDemoModeActive()) return { propertyId: null };

  const idle = buildDemoIdleSnapshot();
  applyDemoSnapshotForSegment(idle);
  const fallbackPropertyId = idle.properties[0]?.id ?? null;

  if (segment === "leasing" || segment === "applications" || segment === "promotion") {
    const propertyId = await prepareDemoListedProperty();
    return { propertyId: propertyId ?? fallbackPropertyId };
  }

  if (segment === "work_orders") {
    const propertyId = (await prepareDemoListedProperty()) ?? fallbackPropertyId;
    if (propertyId) {
      createDemoMaintenanceWorkOrder(propertyId);
    }
    return { propertyId };
  }

  // overall / inbox / payments run directly on the idle portfolio; the
  // overall script creates its own property through the listing wizard.
  return { propertyId: fallbackPropertyId };
}
