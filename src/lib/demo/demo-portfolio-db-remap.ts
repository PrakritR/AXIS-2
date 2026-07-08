import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import type { VendorPayout } from "@/lib/vendor-payouts";
import {
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_VENDOR_EMAIL,
  CANONICAL_DEMO_VENDOR_NAME,
} from "@/lib/demo/demo-canonical-accounts";
import type { DemoDataSnapshot } from "@/lib/demo/demo-guided-data";
import {
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_USER_ID,
  DEMO_VENDOR_USER_ID,
} from "@/lib/demo/demo-session";
import type { DemoScheduleSeed } from "@/lib/demo/demo-data";
import type { PartnerInquiry, PlannedEvent } from "@/lib/demo-admin-scheduling";

/** Demo idle application id for the canonical resident (Alex Rivera). */
export const DEMO_CANONICAL_RESIDENT_APP_DEMO_ID = "demo-app-4";

/** Charge/application cross-refs in demo-data for the canonical resident. */
export const DEMO_CANONICAL_RESIDENT_CHARGE_APP_REF = "AXIS-DEMOAPP4";

export type DemoPortfolioDbContext = {
  managerUserId: string;
  residentUserId: string;
  vendorUserId: string;
  residentEmail: string;
  vendorEmail: string;
  residentAxisId: string;
};

function isCanonicalResidentEmail(email: string | undefined, ctx: DemoPortfolioDbContext): boolean {
  return email?.trim().toLowerCase() === ctx.residentEmail.trim().toLowerCase();
}

function remapManagerUserId<T extends { managerUserId?: string | null }>(rows: T[], ctx: DemoPortfolioDbContext): T[] {
  return rows.map((row) => ({
    ...row,
    managerUserId: row.managerUserId === DEMO_MANAGER_USER_ID ? ctx.managerUserId : row.managerUserId,
  }));
}

function remapResidentUserId<T extends { residentUserId?: string | null; residentEmail?: string }>(
  rows: T[],
  ctx: DemoPortfolioDbContext,
): T[] {
  return rows.map((row) => {
    if (!isCanonicalResidentEmail(row.residentEmail, ctx)) return row;
    return { ...row, residentUserId: ctx.residentUserId };
  });
}

function remapApplicationId(id: string, ctx: DemoPortfolioDbContext): string {
  if (id === DEMO_CANONICAL_RESIDENT_APP_DEMO_ID) return ctx.residentAxisId;
  return id;
}

function remapApplicationIdRef(value: string | undefined, ctx: DemoPortfolioDbContext): string | undefined {
  if (!value) return value;
  if (value === DEMO_CANONICAL_RESIDENT_CHARGE_APP_REF || value === DEMO_CANONICAL_RESIDENT_APP_DEMO_ID) {
    return ctx.residentAxisId;
  }
  return value;
}

function remapApplications(rows: DemoApplicantRow[], ctx: DemoPortfolioDbContext): DemoApplicantRow[] {
  return rows.map((row) => {
    const nextId = remapApplicationId(row.id, ctx);
    const application =
      row.application && isCanonicalResidentEmail(row.email, ctx)
        ? {
            ...row.application,
            email: ctx.residentEmail,
            ...(row.application.propertyId ? {} : {}),
          }
        : row.application;
    return {
      ...row,
      id: nextId,
      managerUserId: ctx.managerUserId,
      email: isCanonicalResidentEmail(row.email, ctx) ? ctx.residentEmail : row.email,
      ...(application ? { application } : {}),
      ...(row.axisId && row.id === DEMO_CANONICAL_RESIDENT_APP_DEMO_ID ? { axisId: ctx.residentAxisId } : {}),
    };
  });
}

function remapCharges(rows: HouseholdCharge[], ctx: DemoPortfolioDbContext): HouseholdCharge[] {
  return rows.map((row) => ({
    ...row,
    id: row.id,
    managerUserId: ctx.managerUserId,
    residentUserId: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentUserId : row.residentUserId,
    residentEmail: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentEmail : row.residentEmail,
    applicationId: remapApplicationIdRef(row.applicationId, ctx),
  }));
}

function remapWorkOrders(rows: DemoManagerWorkOrderRow[], ctx: DemoPortfolioDbContext): DemoManagerWorkOrderRow[] {
  return rows.map((row) => {
    const vendorLinked =
      row.vendorId === "demo-vendor-1" ||
      row.vendorName === CANONICAL_DEMO_VENDOR_NAME ||
      row.vendorUserId === DEMO_VENDOR_USER_ID;
    return {
      ...row,
      managerUserId: ctx.managerUserId,
      residentEmail: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentEmail : row.residentEmail,
      ...(vendorLinked
        ? {
            vendorUserId: ctx.vendorUserId,
            vendorName: CANONICAL_DEMO_VENDOR_NAME,
          }
        : {}),
    };
  });
}

function remapVendors(rows: ManagerVendorRow[], ctx: DemoPortfolioDbContext): ManagerVendorRow[] {
  return rows.map((row) => {
    const isCanonical =
      row.id === "demo-vendor-1" ||
      row.email?.trim().toLowerCase() === ctx.vendorEmail.trim().toLowerCase() ||
      row.vendorUserId === DEMO_VENDOR_USER_ID;
    if (!isCanonical) {
      return { ...row, managerUserId: ctx.managerUserId };
    }
    return {
      ...row,
      managerUserId: ctx.managerUserId,
      vendorUserId: ctx.vendorUserId,
      email: ctx.vendorEmail,
      name: row.name?.trim() || CANONICAL_DEMO_VENDOR_NAME,
    };
  });
}

function remapBids(rows: WorkOrderBid[], ctx: DemoPortfolioDbContext): WorkOrderBid[] {
  return rows.map((row) =>
    row.vendorUserId === DEMO_VENDOR_USER_ID || row.vendorDirectoryId === "demo-vendor-1"
      ? {
          ...row,
          vendorUserId: ctx.vendorUserId,
          vendorName: CANONICAL_DEMO_VENDOR_NAME,
          vendorDirectoryId: row.vendorDirectoryId ?? "demo-vendor-1",
        }
      : row,
  );
}

function remapSchedule(schedule: DemoScheduleSeed, ctx: DemoPortfolioDbContext): DemoScheduleSeed {
  const remapEvent = <T extends PlannedEvent | PartnerInquiry>(row: T): T => ({
    ...row,
    managerUserId: ctx.managerUserId,
  });
  return {
    plannedEvents: schedule.plannedEvents.map(remapEvent),
    partnerInquiries: schedule.partnerInquiries.map(remapEvent),
    availabilityByPropertyId: schedule.availabilityByPropertyId,
  };
}

/**
 * Inverse of `demo-portal-mirror.server.ts` — rewrites synthetic demo session ids
 * to real Supabase auth UUIDs before writing the idle portfolio to the test DB.
 */
export function remapDemoSnapshotForDb(snapshot: DemoDataSnapshot, ctx: DemoPortfolioDbContext): DemoDataSnapshot {
  return {
    properties: snapshot.properties.map((p) => ({
      ...p,
      managerUserId: ctx.managerUserId,
    })),
    applications: remapApplications(snapshot.applications, ctx),
    charges: remapCharges(snapshot.charges, ctx),
    rentProfiles: remapResidentUserId(remapManagerUserId(snapshot.rentProfiles, ctx), ctx).map((row) => ({
      ...row,
      residentEmail: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentEmail : row.residentEmail,
    })),
    leases: remapManagerUserId(snapshot.leases, ctx).map((row) => ({
      ...row,
      residentEmail: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentEmail : row.residentEmail,
      residentUserId: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentUserId : row.residentUserId,
    })),
    workOrders: remapWorkOrders(snapshot.workOrders, ctx),
    workOrderBids: remapBids(snapshot.workOrderBids, ctx),
    vendorPayouts: snapshot.vendorPayouts,
    vendors: remapVendors(snapshot.vendors, ctx),
    promotions: remapManagerUserId(snapshot.promotions, ctx),
    serviceRequests: remapManagerUserId(snapshot.serviceRequests, ctx).map((row) => ({
      ...row,
      residentEmail: isCanonicalResidentEmail(row.residentEmail, ctx) ? ctx.residentEmail : row.residentEmail,
    })),
    managerInbox: snapshot.managerInbox,
    residentInbox: snapshot.residentInbox,
    vendorInbox: snapshot.vendorInbox,
    adminInbox: snapshot.adminInbox,
    bugFeedback: snapshot.bugFeedback,
    schedule: remapSchedule(snapshot.schedule, ctx),
    residentUploads: snapshot.residentUploads,
  };
}

/** Guardrails for tests — canonical emails must match demo session constants. */
export function assertCanonicalDemoPortfolioContext(ctx: DemoPortfolioDbContext): void {
  if (ctx.residentEmail.trim().toLowerCase() !== CANONICAL_DEMO_RESIDENT_EMAIL) {
    throw new Error(`residentEmail must be ${CANONICAL_DEMO_RESIDENT_EMAIL}`);
  }
  if (ctx.vendorEmail.trim().toLowerCase() !== CANONICAL_DEMO_VENDOR_EMAIL) {
    throw new Error(`vendorEmail must be ${CANONICAL_DEMO_VENDOR_EMAIL}`);
  }
}

export function remapPropertyForDb(property: MockProperty, ctx: DemoPortfolioDbContext): MockProperty {
  return { ...property, managerUserId: ctx.managerUserId };
}
