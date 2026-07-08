import { buildDemoPropertyCreationSubmission } from "@/lib/demo/demo-listing-autofill";
import { buildDemoBlankSnapshot, buildDemoIdleSnapshot } from "@/lib/demo/demo-guided-data";
import type { DemoSegment } from "@/lib/demo/demo-segments";
import {
  approvePendingManagerProperty,
  PROPERTY_PIPELINE_EVENT,
  submitManagerPendingPropertyToServer,
} from "@/lib/demo-property-pipeline";
import { isDemoModeActive, resolveDemoManagerScopeUserId } from "@/lib/demo/demo-session";
import { applyDemoSnapshotForSegment, seedDemoBlankData } from "@/lib/demo/demo-seed";
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

/** Seed starting data for a non-overall segment before autoplay. */
export async function prepareDemoSegment(segment: DemoSegment): Promise<{ propertyId: string | null }> {
  if (!isDemoModeActive()) return { propertyId: null };

  if (segment === "overall") {
    seedDemoBlankData();
    return { propertyId: null };
  }

  if (segment === "leasing") {
    seedDemoBlankData();
    const propertyId = await prepareDemoListedProperty();
    return { propertyId };
  }

  if (segment === "applications") {
    seedDemoBlankData();
    const propertyId = await prepareDemoListedProperty();
    return { propertyId };
  }

  if (segment === "inbox") {
    seedDemoBlankData();
    const idle = buildDemoIdleSnapshot();
    applyDemoSnapshotForSegment({
      ...buildDemoBlankSnapshot(),
      properties: idle.properties.slice(0, 2),
      applications: idle.applications.filter((a) => a.bucket === "approved").slice(0, 2),
      managerInbox: idle.managerInbox,
      residentInbox: idle.residentInbox,
    });
    return { propertyId: idle.properties[0]?.id ?? null };
  }

  if (segment === "promotion") {
    seedDemoBlankData();
    const propertyId = await prepareDemoListedProperty();
    return { propertyId };
  }

  if (segment === "payments") {
    seedDemoBlankData();
    const idle = buildDemoIdleSnapshot();
    const snapshot = {
      ...buildDemoBlankSnapshot(),
      properties: idle.properties,
      applications: idle.applications.filter((a) => a.bucket === "approved"),
      leases: idle.leases.filter((l) => l.status === "Fully Signed"),
      charges: idle.charges.filter((c) => c.status === "pending"),
      rentProfiles: idle.rentProfiles,
      managerInbox: idle.managerInbox.slice(0, 3),
      residentInbox: idle.residentInbox.slice(0, 3),
    };
    applyDemoSnapshotForSegment(snapshot);
    return { propertyId: idle.properties[0]?.id ?? null };
  }

  if (segment === "work_orders") {
    seedDemoBlankData();
    const propertyId = await prepareDemoListedProperty();
    const idle = buildDemoIdleSnapshot();
    applyDemoSnapshotForSegment({
      ...buildDemoBlankSnapshot(),
      properties: propertyId
        ? idle.properties.filter((p) => p.id === propertyId)
        : idle.properties.slice(0, 1),
      applications: idle.applications.filter((a) => a.bucket === "approved").slice(0, 1),
      leases: idle.leases.filter((l) => l.status === "Fully Signed").slice(0, 1),
      vendors: idle.vendors,
    });
    if (propertyId) {
      createDemoMaintenanceWorkOrder(propertyId);
    }
    return { propertyId };
  }

  seedDemoBlankData();
  return { propertyId: null };
}
