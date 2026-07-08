import "server-only";

import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import type { VendorPayout } from "@/lib/vendor-payouts";
import {
  CANONICAL_DEMO_MANAGER_EMAIL,
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_VENDOR_EMAIL,
  CANONICAL_DEMO_VENDOR_NAME,
} from "@/lib/demo/demo-canonical-accounts";
import {
  DEMO_MANAGER_USER_ID,
  DEMO_RESIDENT_USER_ID,
  DEMO_VENDOR_USER_ID,
} from "@/lib/demo/demo-session";
import { buildDemoIdleSnapshot, type DemoDataSnapshot } from "@/lib/demo/demo-guided-data";
import type { DemoScheduleSeed } from "@/lib/demo/demo-data";
import type { PartnerInquiry, PlannedEvent } from "@/lib/demo-admin-scheduling";
import {
  MANAGER_INBOX_SCOPE,
  RESIDENT_INBOX_SCOPE,
  VENDOR_INBOX_SCOPE,
} from "@/lib/portal-inbox-thread-scope";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

function rowData<T>(value: unknown): T | null {
  return value && typeof value === "object" ? (value as T) : null;
}

function remapManagerScope<T extends { managerUserId?: string | null }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, managerUserId: DEMO_MANAGER_USER_ID }));
}

function remapResidentScope<T extends { residentUserId?: string | null; residentEmail?: string }>(
  rows: T[],
  residentEmail: string,
): T[] {
  return rows.map((row) => {
    const email = row.residentEmail?.trim().toLowerCase();
    return {
      ...row,
      residentUserId: email === residentEmail ? DEMO_RESIDENT_USER_ID : row.residentUserId ?? null,
    };
  });
}

function remapWorkOrders(
  rows: DemoManagerWorkOrderRow[],
  vendorDirectoryName: string | null,
): DemoManagerWorkOrderRow[] {
  return rows.map((row) => {
    const next: DemoManagerWorkOrderRow = {
      ...row,
      managerUserId: DEMO_MANAGER_USER_ID,
      residentEmail: row.residentEmail?.trim().toLowerCase() || row.residentEmail,
    };
    if (row.vendorId || row.vendorName) {
      next.vendorName = vendorDirectoryName ?? CANONICAL_DEMO_VENDOR_NAME;
    }
    return next;
  });
}

function remapBids(rows: WorkOrderBid[], vendorUserId: string | null): WorkOrderBid[] {
  return rows.map((row) =>
    row.vendorUserId === vendorUserId
      ? { ...row, vendorUserId: DEMO_VENDOR_USER_ID, vendorName: CANONICAL_DEMO_VENDOR_NAME }
      : row,
  );
}

function remapVendors(rows: ManagerVendorRow[], vendorUserId: string | null, vendorEmail: string): ManagerVendorRow[] {
  return rows.map((row) =>
    row.vendorUserId === vendorUserId || row.email?.trim().toLowerCase() === vendorEmail
      ? {
          ...row,
          managerUserId: DEMO_MANAGER_USER_ID,
          vendorUserId: DEMO_VENDOR_USER_ID,
          email: vendorEmail,
          name: row.name?.trim() || CANONICAL_DEMO_VENDOR_NAME,
        }
      : { ...row, managerUserId: DEMO_MANAGER_USER_ID },
  );
}

function remapInbox(rows: PersistedInboxThread[]): PersistedInboxThread[] {
  return rows.map((row) => ({
    ...row,
    email: row.email?.trim().toLowerCase() || row.email,
  }));
}

async function resolveProfileIds(db: Db) {
  const emails = [
    CANONICAL_DEMO_MANAGER_EMAIL,
    CANONICAL_DEMO_RESIDENT_EMAIL,
    CANONICAL_DEMO_VENDOR_EMAIL,
  ];
  const { data, error } = await db.from("profiles").select("id, email, role").in("email", emails);
  if (error) throw new Error(error.message);
  const byEmail = new Map((data ?? []).map((row) => [String(row.email ?? "").toLowerCase(), String(row.id)]));
  return {
    managerUserId: byEmail.get(CANONICAL_DEMO_MANAGER_EMAIL) ?? null,
    residentUserId: byEmail.get(CANONICAL_DEMO_RESIDENT_EMAIL) ?? null,
    vendorUserId: byEmail.get(CANONICAL_DEMO_VENDOR_EMAIL) ?? null,
  };
}

async function fetchRowDataTable<T>(db: Db, table: string, column: string, value: string): Promise<T[]> {
  const { data, error } = await db.from(table).select("row_data").eq(column, value).limit(500);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? [])
    .map((record) => rowData<T>(record.row_data))
    .filter((row): row is T => Boolean(row));
}

async function fetchInbox(
  db: Db,
  scope: string,
  ownerUserId: string,
): Promise<PersistedInboxThread[]> {
  const { data, error } = await db
    .from("portal_inbox_thread_records")
    .select("row_data")
    .eq("scope", scope)
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`portal_inbox_thread_records: ${error.message}`);
  return (data ?? [])
    .map((record) => rowData<PersistedInboxThread>(record.row_data))
    .filter((row): row is PersistedInboxThread => Boolean(row?.id));
}

async function fetchProperties(db: Db, managerUserId: string): Promise<MockProperty[]> {
  const { data, error } = await db
    .from("manager_property_records")
    .select("id, property_data, row_data, status")
    .eq("manager_user_id", managerUserId)
    .limit(200);
  if (error) throw new Error(`manager_property_records: ${error.message}`);
  return (data ?? [])
    .map((record) => {
      const property = rowData<MockProperty>(record.property_data) ?? rowData<MockProperty>(record.row_data);
      if (!property) return null;
      return {
        ...property,
        id: property.id || String(record.id),
        managerUserId: DEMO_MANAGER_USER_ID,
        adminPublishLive: record.status === "live" ? true : property.adminPublishLive,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null) as MockProperty[];
}

async function fetchSchedule(db: Db, managerUserId: string): Promise<DemoScheduleSeed> {
  const staticSchedule = buildDemoIdleSnapshot().schedule;
  const { data, error } = await db
    .from("portal_schedule_records")
    .select("id, row_data, record_type")
    .or(`manager_user_id.eq.${managerUserId},id.eq.axis_admin_planned_events_v1,id.eq.axis_admin_partner_inquiries_v1`)
    .limit(500);
  if (error) return staticSchedule;

  const plannedEvents: PlannedEvent[] = [];
  const partnerInquiries: PartnerInquiry[] = [];
  for (const record of data ?? []) {
    const row = rowData<Record<string, unknown>>(record.row_data);
    if (!row) continue;
    const recordType = String(record.record_type ?? row.recordType ?? "");
    if (record.id === "axis_admin_planned_events_v1" && Array.isArray(row.events)) {
      plannedEvents.push(...(row.events as PlannedEvent[]));
      continue;
    }
    if (record.id === "axis_admin_partner_inquiries_v1" && Array.isArray(row.inquiries)) {
      partnerInquiries.push(...(row.inquiries as PartnerInquiry[]));
      continue;
    }
    if (recordType === "planned_event" || row.kind === "tour") {
      plannedEvents.push(row as unknown as PlannedEvent);
    }
    if (recordType === "partner_inquiry_request" || row.kind === "tour") {
      partnerInquiries.push(row as unknown as PartnerInquiry);
    }
  }

  if (plannedEvents.length === 0 && partnerInquiries.length === 0) return staticSchedule;
  return {
    plannedEvents: plannedEvents.length ? remapManagerScope(plannedEvents) : staticSchedule.plannedEvents,
    partnerInquiries: partnerInquiries.length ? remapManagerScope(partnerInquiries) : staticSchedule.partnerInquiries,
    availabilityByPropertyId: staticSchedule.availabilityByPropertyId,
  };
}

async function fetchVendorPayouts(db: Db, vendorUserId: string): Promise<VendorPayout[]> {
  const { data, error } = await db
    .from("vendor_payouts")
    .select("id, work_order_id, amount_cents, stripe_transfer_id, status, failure_reason, created_at")
    .eq("vendor_user_id", vendorUserId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    workOrderId: String(row.work_order_id),
    amountCents: Number(row.amount_cents ?? 0),
    stripeTransferId: row.stripe_transfer_id ? String(row.stripe_transfer_id) : null,
    status: row.status as VendorPayout["status"],
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    createdAt: String(row.created_at),
  }));
}

async function fetchWorkOrderBids(db: Db, vendorUserId: string): Promise<WorkOrderBid[]> {
  const { data, error } = await db
    .from("work_order_bids")
    .select(
      "id, work_order_id, vendor_user_id, vendor_directory_id, vendor_name, quote_mode, consultation_visit_at, amount_cents, materials_cents, proposed_time, note, status, created_at, updated_at",
    )
    .eq("vendor_user_id", vendorUserId)
    .limit(200);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: String(row.id),
    workOrderId: String(row.work_order_id),
    vendorUserId: String(row.vendor_user_id),
    vendorDirectoryId: row.vendor_directory_id ? String(row.vendor_directory_id) : null,
    vendorName: String(row.vendor_name ?? ""),
    quoteMode: row.quote_mode as WorkOrderBid["quoteMode"],
    consultationVisitAt: row.consultation_visit_at ? String(row.consultation_visit_at) : null,
    amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
    materialsCents: Number(row.materials_cents ?? 0),
    proposedTime: row.proposed_time ? String(row.proposed_time) : null,
    note: row.note ? String(row.note) : null,
    status: row.status as WorkOrderBid["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

function mergeWithStaticFallback(mirror: Partial<DemoDataSnapshot>): DemoDataSnapshot {
  const base = buildDemoIdleSnapshot();
  return {
    properties: mirror.properties?.length ? mirror.properties : base.properties,
    applications: mirror.applications?.length ? mirror.applications : base.applications,
    charges: mirror.charges?.length ? mirror.charges : base.charges,
    rentProfiles: mirror.rentProfiles?.length ? mirror.rentProfiles : base.rentProfiles,
    leases: mirror.leases?.length ? mirror.leases : base.leases,
    workOrders: mirror.workOrders?.length ? mirror.workOrders : base.workOrders,
    workOrderBids: mirror.workOrderBids?.length ? mirror.workOrderBids : base.workOrderBids,
    vendorPayouts: mirror.vendorPayouts?.length ? mirror.vendorPayouts : base.vendorPayouts,
    vendors: mirror.vendors?.length ? mirror.vendors : base.vendors,
    promotions: mirror.promotions?.length ? mirror.promotions : base.promotions,
    serviceRequests: mirror.serviceRequests?.length ? mirror.serviceRequests : base.serviceRequests,
    managerInbox: mirror.managerInbox?.length ? mirror.managerInbox : base.managerInbox,
    residentInbox: mirror.residentInbox?.length ? mirror.residentInbox : base.residentInbox,
    vendorInbox: mirror.vendorInbox?.length ? mirror.vendorInbox : base.vendorInbox,
    adminInbox: base.adminInbox,
    bugFeedback: base.bugFeedback,
    schedule: mirror.schedule ?? base.schedule,
    residentUploads: base.residentUploads,
  };
}

/**
 * Read-only snapshot of the canonical test portal accounts for `/demo`.
 * Rewrites scope ids to the synthetic demo session keys the UI expects.
 */
export async function fetchDemoPortalMirrorSnapshot(): Promise<DemoDataSnapshot | null> {
  const db = createSupabaseServiceRoleClient();
  const ids = await resolveProfileIds(db);
  if (!ids.managerUserId) return null;

  const [
    properties,
    applications,
    charges,
    rentProfiles,
    leases,
    workOrders,
    vendors,
    promotions,
    serviceRequests,
    managerInbox,
    residentInbox,
    vendorInbox,
    schedule,
    workOrderBids,
    vendorPayouts,
  ] = await Promise.all([
    fetchProperties(db, ids.managerUserId),
    fetchRowDataTable<DemoApplicantRow>(db, "manager_application_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<HouseholdCharge>(db, "portal_household_charge_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<RecurringRentProfile>(
      db,
      "portal_recurring_rent_profile_records",
      "manager_user_id",
      ids.managerUserId,
    ),
    fetchRowDataTable<LeasePipelineRow>(db, "portal_lease_pipeline_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<DemoManagerWorkOrderRow>(db, "portal_work_order_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<ManagerVendorRow>(db, "manager_vendor_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<ManagerPromotionRow>(db, "manager_promotion_records", "manager_user_id", ids.managerUserId),
    fetchRowDataTable<ServiceRequest>(db, "portal_service_request_records", "manager_user_id", ids.managerUserId),
    fetchInbox(db, MANAGER_INBOX_SCOPE, ids.managerUserId),
    ids.residentUserId ? fetchInbox(db, RESIDENT_INBOX_SCOPE, ids.residentUserId) : Promise.resolve([]),
    ids.vendorUserId ? fetchInbox(db, VENDOR_INBOX_SCOPE, ids.vendorUserId) : Promise.resolve([]),
    fetchSchedule(db, ids.managerUserId),
    ids.vendorUserId ? fetchWorkOrderBids(db, ids.vendorUserId) : Promise.resolve([]),
    ids.vendorUserId ? fetchVendorPayouts(db, ids.vendorUserId) : Promise.resolve([]),
  ]);

  const primaryVendor = vendors.find(
    (v) => v.vendorUserId === ids.vendorUserId || v.email?.trim().toLowerCase() === CANONICAL_DEMO_VENDOR_EMAIL,
  );

  const mirrored: Partial<DemoDataSnapshot> = {
    properties: remapManagerScope(properties),
    applications: remapManagerScope(
      remapResidentScope(applications, CANONICAL_DEMO_RESIDENT_EMAIL),
    ) as DemoApplicantRow[],
    charges: remapManagerScope(remapResidentScope(charges, CANONICAL_DEMO_RESIDENT_EMAIL)),
    rentProfiles: remapManagerScope(remapResidentScope(rentProfiles, CANONICAL_DEMO_RESIDENT_EMAIL)),
    leases: remapManagerScope(leases),
    workOrders: remapWorkOrders(workOrders, primaryVendor?.name ?? CANONICAL_DEMO_VENDOR_NAME),
    workOrderBids: remapBids(workOrderBids, ids.vendorUserId),
    vendorPayouts,
    vendors: remapVendors(vendors, ids.vendorUserId, CANONICAL_DEMO_VENDOR_EMAIL),
    promotions: remapManagerScope(promotions),
    serviceRequests: remapManagerScope(serviceRequests),
    managerInbox: remapInbox(managerInbox),
    residentInbox: remapInbox(residentInbox),
    vendorInbox: remapInbox(vendorInbox),
    schedule,
  };

  return mergeWithStaticFallback(mirrored);
}

export function buildStaticDemoPortalSnapshot(): DemoDataSnapshot {
  return buildDemoIdleSnapshot();
}
