/**
 * Shared "offer this work order to vendors for bids" logic, extracted from the
 * work-order-vendor-offers route so the agent tool layer runs the exact same
 * offer upsert + bid-offer email + inbox notification + biddingOpen transition
 * as the manager UI — no second notification path.
 */
import { track } from "@/lib/analytics/posthog";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendVendorNotification } from "@/lib/vendor-notification-delivery";
import { buildVendorBidOfferEmail } from "@/lib/vendor-visit-email";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { WorkOrderActionFailure, WorkOrderActor } from "@/lib/work-order-bids.server";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

export const MAX_VENDORS_PER_SEND = 10;

export type VendorDirectorySummary = {
  name: string;
  email: string;
  trade: string;
  managerUserId: string | null;
  shared: boolean;
  vendorUserId: string | null;
};

export async function vendorDirectoryRowsById(db: Db, ids: string[]): Promise<Map<string, VendorDirectorySummary>> {
  const out = new Map<string, VendorDirectorySummary>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return out;
  const { data } = await db
    .from("manager_vendor_records")
    .select("id, manager_user_id, vendor_user_id, row_data")
    .in("id", uniqueIds);
  for (const row of data ?? []) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    out.set(row.id as string, {
      name: String(rowData.name ?? ""),
      email: String(rowData.email ?? ""),
      trade: String(rowData.trade ?? ""),
      managerUserId: (row.manager_user_id as string | null) ?? null,
      shared: rowData.sharedWithManagers === true,
      vendorUserId: (row.vendor_user_id as string | null) ?? null,
    });
  }
  return out;
}

/**
 * The manager's confirm-send action: only this path ever offers a work order
 * to a vendor for consultation — nothing is sent automatically. Creates one
 * offer row per selected vendor and notifies each (email + inbox), reusing the
 * same bid-offer copy and delivery path as the single-vendor "Invite for bids"
 * flow, then opens bidding so responses can come back from any of them.
 */
export async function sendWorkOrderVendorOffers(
  db: Db,
  actor: WorkOrderActor,
  body: { workOrderId?: string; vendorIds?: string[] },
): Promise<{ ok: true; sent: string[]; skipped: string[] } | WorkOrderActionFailure> {
  if (!actor.admin && actor.role !== "manager" && actor.role !== "pro") {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  const workOrderId = String(body.workOrderId ?? "").trim();
  const vendorIds = [...new Set((Array.isArray(body.vendorIds) ? body.vendorIds : []).map((v) => String(v).trim()).filter(Boolean))].slice(
    0,
    MAX_VENDORS_PER_SEND,
  );
  if (!workOrderId) return { ok: false, status: 400, error: "Work order id required." };
  if (vendorIds.length === 0) return { ok: false, status: 400, error: "Select at least one vendor." };

  const { data: workOrder } = await db
    .from("portal_work_order_records")
    .select("manager_user_id, row_data")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder || (!actor.admin && workOrder.manager_user_id !== actor.userId)) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  const rowData = (workOrder.row_data ?? {}) as DemoManagerWorkOrderRow;

  const vendors = await vendorDirectoryRowsById(db, vendorIds);
  const sent: string[] = [];
  const skipped: string[] = [];

  for (const vendorId of vendorIds) {
    const vendor = vendors.get(vendorId);
    const owned = Boolean(vendor) && (actor.admin || vendor!.managerUserId === (workOrder.manager_user_id as string) || vendor!.shared);
    if (!vendor || !owned) {
      skipped.push(vendorId);
      continue;
    }

    const now = new Date().toISOString();
    const { error: offerError } = await db.from("work_order_vendor_offers").upsert(
      {
        work_order_id: workOrderId,
        vendor_directory_id: vendorId,
        vendor_user_id: vendor.vendorUserId,
        manager_user_id: workOrder.manager_user_id,
        status: "sent",
        updated_at: now,
      },
      { onConflict: "work_order_id,vendor_directory_id" },
    );
    if (offerError) {
      skipped.push(vendorId);
      continue;
    }
    sent.push(vendorId);

    if (vendor.email.includes("@")) {
      const { subject, body: messageBody } = buildVendorBidOfferEmail({
        vendorName: vendor.name,
        workOrderTitle: rowData.title || "",
        propertyLabel: rowData.propertyName || "",
        unit: rowData.unit || "",
        visitLabel: rowData.scheduled && rowData.scheduled !== "—" ? rowData.scheduled : "",
        description: rowData.description,
      });
      await sendVendorNotification(db, actor, {
        vendorEmail: vendor.email,
        vendorDirectoryId: vendorId,
        vendorUserId: vendor.vendorUserId,
        subject,
        body: messageBody,
      }).catch(() => undefined);
    }
  }

  if (sent.length > 0) {
    const nextRowData: DemoManagerWorkOrderRow = {
      ...rowData,
      biddingOpen: true,
      biddingOpenedAt: rowData.biddingOpenedAt ?? new Date().toISOString(),
    };
    await db
      .from("portal_work_order_records")
      .update({ row_data: nextRowData, updated_at: new Date().toISOString() })
      .eq("id", workOrderId);
  }

  track("work_order_vendor_offer_sent", actor.userId, { work_order_id: workOrderId, vendor_count: sent.length });
  return { ok: true, sent, skipped };
}
