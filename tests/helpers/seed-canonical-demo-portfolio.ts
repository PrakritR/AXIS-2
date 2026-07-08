#!/usr/bin/env npx tsx
/**
 * Writes the idle `/demo` portfolio (buildDemoIdleSnapshot) into the canonical
 * test Supabase accounts. Invoked from tests/helpers/seed-test-db.mjs after
 * manager / resident / vendor auth users exist.
 *
 * Env (required):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SEED_MANAGER_USER_ID, SEED_RESIDENT_USER_ID, SEED_VENDOR_USER_ID
 *   SEED_RESIDENT_AXIS_ID (default AXIS-TESTRSID)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { MockProperty } from "@/data/types";
import {
  CANONICAL_DEMO_MANAGER_NAME,
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_RESIDENT_NAME,
  CANONICAL_DEMO_VENDOR_EMAIL,
  CANONICAL_DEMO_VENDOR_NAME,
} from "@/lib/demo/demo-canonical-accounts";
import { buildDemoIdleSnapshot } from "@/lib/demo/demo-guided-data";
import {
  assertCanonicalDemoPortfolioContext,
  remapDemoSnapshotForDb,
  type DemoPortfolioDbContext,
} from "@/lib/demo/demo-portfolio-db-remap";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import type { VendorPayout } from "@/lib/vendor-payouts";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";
const VENDOR_INBOX_SCOPE = "axis_portal_inbox_vendor_v1";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const managerUserId = process.env.SEED_MANAGER_USER_ID?.trim();
const residentUserId = process.env.SEED_RESIDENT_USER_ID?.trim();
const vendorUserId = process.env.SEED_VENDOR_USER_ID?.trim();
const residentAxisId = process.env.SEED_RESIDENT_AXIS_ID?.trim() || "AXIS-TESTRSID";

if (!url || !serviceKey || !managerUserId || !residentUserId || !vendorUserId) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_MANAGER_USER_ID, SEED_RESIDENT_USER_ID, SEED_VENDOR_USER_ID",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ctx: DemoPortfolioDbContext = {
  managerUserId,
  residentUserId,
  vendorUserId,
  residentEmail: CANONICAL_DEMO_RESIDENT_EMAIL,
  vendorEmail: CANONICAL_DEMO_VENDOR_EMAIL,
  residentAxisId,
};

assertCanonicalDemoPortfolioContext(ctx);

async function must<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>, label: string): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

function demoStableUuid(namespace: string, demoId: string): string {
  const match = demoId.match(/(\d+)/);
  const suffix = (match?.[1] ?? "0").padStart(12, "0").slice(-12);
  const ns = (namespace.charCodeAt(0) % 16).toString(16);
  return `00000000-0000-4000-800${ns}-${suffix}`;
}

async function upsertProperties(properties: MockProperty[]) {
  const rows = properties.map((property) => ({
    id: property.id,
    manager_user_id: ctx.managerUserId,
    status: "live",
    property_data: { ...property, managerUserId: ctx.managerUserId, adminPublishLive: true },
    row_data: {
      id: property.id,
      status: "live",
      name: property.buildingName ?? property.title,
      buildingName: property.buildingName ?? property.title,
      address: property.address,
      managerUserId: ctx.managerUserId,
    },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("manager_property_records").upsert(rows, { onConflict: "id" }), "manager_property_records");
}

async function upsertApplications(applications: DemoApplicantRow[]) {
  const rows = applications.map((app) => ({
    id: app.id,
    manager_user_id: ctx.managerUserId,
    resident_email: app.email?.includes("@") ? app.email.toLowerCase() : null,
    property_id: app.propertyId ?? app.assignedPropertyId ?? null,
    assigned_property_id: app.assignedPropertyId ?? app.propertyId ?? null,
    row_data: {
      ...app,
      managerUserId: ctx.managerUserId,
      axisId: app.id,
    },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("manager_application_records").upsert(rows, { onConflict: "id" }), "manager_application_records");
}

async function upsertCharges(charges: HouseholdCharge[]) {
  const rows = charges.map((charge) => ({
    id: charge.id,
    manager_user_id: ctx.managerUserId,
    resident_user_id: charge.residentUserId ?? null,
    resident_email: charge.residentEmail?.toLowerCase() ?? null,
    property_id: charge.propertyId ?? null,
    kind: charge.kind ?? "rent",
    status: charge.status,
    row_data: { ...charge, managerUserId: ctx.managerUserId },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("portal_household_charge_records").upsert(rows, { onConflict: "id" }), "portal_household_charge_records");
}

async function upsertRentProfiles(profiles: RecurringRentProfile[]) {
  const rows = profiles.map((profile) => ({
    id: profile.id,
    manager_user_id: ctx.managerUserId,
    resident_user_id: profile.residentUserId ?? null,
    resident_email: profile.residentEmail?.toLowerCase() ?? null,
    property_id: profile.propertyId ?? null,
    row_data: { ...profile, managerUserId: ctx.managerUserId },
    updated_at: new Date().toISOString(),
  }));
  await must(
    db.from("portal_recurring_rent_profile_records").upsert(rows, { onConflict: "id" }),
    "portal_recurring_rent_profile_records",
  );
}

async function upsertLeases(leases: LeasePipelineRow[]) {
  const rows = leases.map((lease) => ({
    id: lease.id,
    manager_user_id: ctx.managerUserId,
    resident_user_id: lease.residentUserId ?? null,
    resident_email: lease.residentEmail?.toLowerCase() ?? null,
    property_id: lease.propertyId ?? null,
    status: lease.status ?? lease.stageLabel ?? null,
    row_data: { ...lease, managerUserId: ctx.managerUserId },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("portal_lease_pipeline_records").upsert(rows, { onConflict: "id" }), "portal_lease_pipeline_records");
}

async function upsertWorkOrders(workOrders: DemoManagerWorkOrderRow[]) {
  const rows = workOrders.map((wo) => ({
    id: wo.id,
    manager_user_id: ctx.managerUserId,
    resident_email: wo.residentEmail?.toLowerCase() ?? null,
    property_id: wo.propertyId ?? null,
    assigned_property_id: wo.assignedPropertyId ?? wo.propertyId ?? null,
    vendor_user_id:
      wo.vendorId === "demo-vendor-1" || wo.vendorName === CANONICAL_DEMO_VENDOR_NAME ? ctx.vendorUserId : null,
    row_data: {
      ...wo,
      managerUserId: ctx.managerUserId,
      ...(wo.vendorId === "demo-vendor-1" ? { vendorUserId: ctx.vendorUserId } : {}),
    },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("portal_work_order_records").upsert(rows, { onConflict: "id" }), "portal_work_order_records");
}

async function upsertVendors(vendors: ManagerVendorRow[]) {
  const rows = vendors.map((vendor) => ({
    id: vendor.id,
    manager_user_id: ctx.managerUserId,
    vendor_user_id: vendor.vendorUserId ?? (vendor.id === "demo-vendor-1" ? ctx.vendorUserId : null),
    row_data: {
      ...vendor,
      managerUserId: ctx.managerUserId,
      ...(vendor.id === "demo-vendor-1" ? { vendorUserId: ctx.vendorUserId, email: ctx.vendorEmail } : {}),
    },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("manager_vendor_records").upsert(rows, { onConflict: "id" }), "manager_vendor_records");
}

async function upsertPromotions(promotions: ManagerPromotionRow[]) {
  const rows = promotions.map((promo) => ({
    id: promo.id,
    manager_user_id: ctx.managerUserId,
    row_data: { ...promo, managerUserId: ctx.managerUserId },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("manager_promotion_records").upsert(rows, { onConflict: "id" }), "manager_promotion_records");
}

async function upsertServiceRequests(requests: ServiceRequest[]) {
  const rows = requests.map((req) => ({
    id: req.id,
    manager_user_id: ctx.managerUserId,
    resident_email: req.residentEmail?.toLowerCase() ?? null,
    property_id: req.propertyId ?? null,
    row_data: { ...req, managerUserId: ctx.managerUserId },
    updated_at: new Date().toISOString(),
  }));
  await must(db.from("portal_service_request_records").upsert(rows, { onConflict: "id" }), "portal_service_request_records");
}

async function upsertInboxThreads(
  threads: PersistedInboxThread[],
  scope: string,
  ownerUserId: string,
) {
  const now = new Date().toISOString();
  const rows = threads.map((thread) => ({
    id: thread.id,
    scope,
    owner_user_id: ownerUserId,
    participant_email: thread.email?.toLowerCase() ?? null,
    thread_type: "portal_message",
    row_data: { ...thread, scope },
    updated_at: now,
  }));
  if (rows.length === 0) return;
  await must(db.from("portal_inbox_thread_records").upsert(rows, { onConflict: "id" }), `portal_inbox_thread_records(${scope})`);
}

async function upsertSchedule(snapshot: ReturnType<typeof remapDemoSnapshotForDb>["schedule"]) {
  const now = new Date().toISOString();
  const records: Array<Record<string, unknown>> = [];

  records.push({
    id: "axis_admin_planned_events_v1",
    manager_user_id: ctx.managerUserId,
    record_type: "axis_admin_planned_events_v1",
    row_data: {
      id: "axis_admin_planned_events_v1",
      recordType: "axis_admin_planned_events_v1",
      managerUserId: ctx.managerUserId,
      payload: snapshot.plannedEvents,
    },
    updated_at: now,
  });

  records.push({
    id: "axis_admin_partner_inquiries_v1",
    manager_user_id: ctx.managerUserId,
    record_type: "axis_admin_partner_inquiries_v1",
    row_data: {
      id: "axis_admin_partner_inquiries_v1",
      recordType: "axis_admin_partner_inquiries_v1",
      managerUserId: ctx.managerUserId,
      payload: snapshot.partnerInquiries,
    },
    updated_at: now,
  });

  for (const event of snapshot.plannedEvents) {
    records.push({
      id: event.id,
      manager_user_id: ctx.managerUserId,
      property_id: event.propertyId ?? null,
      record_type: "planned_event",
      starts_at: event.start,
      ends_at: event.end,
      row_data: { ...event, recordType: "planned_event", managerUserId: ctx.managerUserId },
      updated_at: now,
    });
  }

  for (const inquiry of snapshot.partnerInquiries) {
    records.push({
      id: inquiry.id,
      manager_user_id: ctx.managerUserId,
      property_id: inquiry.propertyId ?? null,
      record_type: "partner_inquiry_request",
      starts_at: inquiry.proposedStart ?? inquiry.requestedWindows?.[0]?.start ?? null,
      ends_at: inquiry.proposedEnd ?? inquiry.requestedWindows?.[0]?.end ?? null,
      row_data: {
        id: inquiry.id,
        recordType: "partner_inquiry_request",
        managerUserId: ctx.managerUserId,
        propertyId: inquiry.propertyId,
        payload: inquiry,
      },
      updated_at: now,
    });
  }

  for (const [propertyId, slots] of Object.entries(snapshot.availabilityByPropertyId)) {
    const key = `axis_mgr_avail_slots_v2_${ctx.managerUserId}_prop_${propertyId}`;
    records.push({
      id: key,
      manager_user_id: ctx.managerUserId,
      property_id: propertyId,
      record_type: "manager_property_availability",
      row_data: {
        id: key,
        recordType: "manager_property_availability",
        managerUserId: ctx.managerUserId,
        propertyId,
        payload: slots,
      },
      updated_at: now,
    });
  }

  await must(db.from("portal_schedule_records").upsert(records, { onConflict: "id" }), "portal_schedule_records");
}

async function upsertWorkOrderBids(bids: WorkOrderBid[]) {
  const rows = bids.map((bid) => ({
    id: demoStableUuid("b", bid.id),
    work_order_id: bid.workOrderId,
    vendor_user_id: ctx.vendorUserId,
    vendor_directory_id: bid.vendorDirectoryId ?? "demo-vendor-1",
    manager_user_id: ctx.managerUserId,
    amount_cents: bid.amountCents,
    materials_cents: bid.materialsCents ?? 0,
    quote_mode: bid.quoteMode ?? "upfront",
    consultation_visit_at: bid.consultationVisitAt,
    proposed_time: bid.proposedTime,
    note: bid.note,
    status: bid.status,
    created_at: bid.createdAt,
    updated_at: bid.updatedAt,
  }));
  if (rows.length === 0) return;
  await must(db.from("work_order_bids").upsert(rows, { onConflict: "id" }), "work_order_bids");
}

async function upsertWorkOrderVendorOffers(workOrders: DemoManagerWorkOrderRow[]) {
  const now = new Date().toISOString();
  const rows = workOrders
    .filter((wo) => wo.biddingOpen && wo.vendorId)
    .map((wo) => ({
      id: demoStableUuid("o", wo.id),
      work_order_id: wo.id,
      vendor_directory_id: wo.vendorId!,
      vendor_user_id: ctx.vendorUserId,
      manager_user_id: ctx.managerUserId,
      status: "sent" as const,
      created_at: now,
      updated_at: now,
    }));
  if (rows.length === 0) return;
  await must(
    db.from("work_order_vendor_offers").upsert(rows, { onConflict: "work_order_id,vendor_directory_id" }),
    "work_order_vendor_offers",
  );
}

async function upsertVendorPayouts(payouts: VendorPayout[]) {
  const rows = payouts.map((payout) => ({
    id: demoStableUuid("p", payout.id),
    manager_user_id: ctx.managerUserId,
    vendor_user_id: ctx.vendorUserId,
    work_order_id: payout.workOrderId,
    amount_cents: payout.amountCents,
    stripe_transfer_id: payout.stripeTransferId,
    status: payout.status,
    failure_reason: payout.failureReason,
    created_at: payout.createdAt,
    updated_at: payout.createdAt,
  }));
  if (rows.length === 0) return;
  await must(db.from("vendor_payouts").upsert(rows, { onConflict: "work_order_id" }), "vendor_payouts");
}

async function upsertProfiles() {
  await must(
    db.from("profiles").upsert(
      [
        {
          id: ctx.managerUserId,
          email: process.env.SEED_MANAGER_EMAIL?.toLowerCase() ?? "manager@test.axis.local",
          role: "manager",
          full_name: CANONICAL_DEMO_MANAGER_NAME,
          application_approved: false,
        },
        {
          id: ctx.residentUserId,
          email: ctx.residentEmail,
          role: "resident",
          manager_id: ctx.residentAxisId,
          full_name: CANONICAL_DEMO_RESIDENT_NAME,
          application_approved: true,
        },
        {
          id: ctx.vendorUserId,
          email: ctx.vendorEmail,
          role: "vendor",
          full_name: CANONICAL_DEMO_VENDOR_NAME,
          application_approved: false,
        },
      ],
      { onConflict: "id" },
    ),
    "profiles(canonical names)",
  );
}

export async function seedCanonicalDemoPortfolio(client: SupabaseClient = db, context: DemoPortfolioDbContext = ctx) {
  const snapshot = remapDemoSnapshotForDb(buildDemoIdleSnapshot(), context);
  await upsertProfiles();
  await upsertProperties(snapshot.properties);
  await upsertApplications(snapshot.applications);
  await upsertCharges(snapshot.charges);
  await upsertRentProfiles(snapshot.rentProfiles);
  await upsertLeases(snapshot.leases);
  await upsertVendors(snapshot.vendors);
  await upsertWorkOrders(snapshot.workOrders);
  await upsertWorkOrderVendorOffers(snapshot.workOrders);
  await upsertPromotions(snapshot.promotions);
  await upsertServiceRequests(snapshot.serviceRequests);
  await upsertInboxThreads(snapshot.managerInbox, MANAGER_INBOX_SCOPE, context.managerUserId);
  await upsertInboxThreads(snapshot.residentInbox, RESIDENT_INBOX_SCOPE, context.residentUserId);
  await upsertInboxThreads(snapshot.vendorInbox, VENDOR_INBOX_SCOPE, context.vendorUserId);
  await upsertSchedule(snapshot.schedule);
  await upsertWorkOrderBids(snapshot.workOrderBids);
  await upsertVendorPayouts(snapshot.vendorPayouts);
}

async function main() {
  await seedCanonicalDemoPortfolio();
  console.log("Seeded canonical demo portfolio for manager / resident / vendor test accounts.");
}

if (process.argv[1]?.includes("seed-canonical-demo-portfolio")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
