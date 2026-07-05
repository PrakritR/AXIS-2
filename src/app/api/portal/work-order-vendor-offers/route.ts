import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendVendorNotification } from "@/lib/vendor-notification-delivery";
import { buildVendorBidOfferEmail } from "@/lib/vendor-visit-email";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

const MAX_VENDORS_PER_SEND = 10;

type OfferRecord = {
  id: string;
  work_order_id: string;
  vendor_directory_id: string;
  vendor_user_id: string | null;
  manager_user_id: string;
  status: "sent" | "withdrawn";
  created_at: string;
  updated_at: string;
};

type OfferJson = {
  id: string;
  workOrderId: string;
  vendorDirectoryId: string;
  vendorUserId: string | null;
  vendorName?: string;
  vendorEmail?: string;
  status: "sent" | "withdrawn";
  createdAt: string;
};

async function sessionActor(db: Db) {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const admin = await isAdminUser(user.id);
  const { data: profile } = await db.from("profiles").select("email, role, full_name").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  return {
    userId: user.id,
    email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
    fullName: profile?.full_name?.trim() || "",
    admin,
    role,
  };
}

async function vendorDirectoryRowsById(
  db: Db,
  ids: string[],
): Promise<Map<string, { name: string; email: string; managerUserId: string | null; shared: boolean; vendorUserId: string | null }>> {
  const out = new Map<string, { name: string; email: string; managerUserId: string | null; shared: boolean; vendorUserId: string | null }>();
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
      managerUserId: (row.manager_user_id as string | null) ?? null,
      shared: rowData.sharedWithManagers === true,
      vendorUserId: (row.vendor_user_id as string | null) ?? null,
    });
  }
  return out;
}

function toJson(offer: OfferRecord, vendors: Map<string, { name: string; email: string }>): OfferJson {
  const vendor = vendors.get(offer.vendor_directory_id);
  return {
    id: offer.id,
    workOrderId: offer.work_order_id,
    vendorDirectoryId: offer.vendor_directory_id,
    vendorUserId: offer.vendor_user_id,
    vendorName: vendor?.name,
    vendorEmail: vendor?.email,
    status: offer.status,
    createdAt: offer.created_at,
  };
}

export async function GET(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const workOrderId = url.searchParams.get("workOrderId")?.trim();

    let query = db.from("work_order_vendor_offers").select("*").order("created_at", { ascending: true });
    if (!actor.admin && actor.role === "vendor") {
      query = query.eq("vendor_user_id", actor.userId);
    } else if (!actor.admin) {
      query = query.eq("manager_user_id", actor.userId);
    }
    if (workOrderId) query = query.eq("work_order_id", workOrderId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const offers = (data ?? []) as OfferRecord[];
    const vendors = await vendorDirectoryRowsById(db, offers.map((o) => o.vendor_directory_id));
    return NextResponse.json({ offers: offers.map((o) => toJson(o, vendors)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load vendor offers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * The manager's confirm-send action: only this route ever offers a work order
 * to a vendor for consultation — nothing is sent automatically. Creates one
 * offer row per selected vendor and notifies each (email + inbox), reusing the
 * same bid-offer copy and delivery path as the single-vendor "Invite for bids"
 * flow, then opens bidding so responses can come back from any of them.
 */
export async function POST(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!actor.admin && actor.role !== "manager" && actor.role !== "pro") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { workOrderId?: string; vendorIds?: string[] };
    const workOrderId = String(body.workOrderId ?? "").trim();
    const vendorIds = [...new Set((Array.isArray(body.vendorIds) ? body.vendorIds : []).map((v) => String(v).trim()).filter(Boolean))].slice(
      0,
      MAX_VENDORS_PER_SEND,
    );
    if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
    if (vendorIds.length === 0) return NextResponse.json({ error: "Select at least one vendor." }, { status: 400 });

    const { data: workOrder } = await db
      .from("portal_work_order_records")
      .select("manager_user_id, row_data")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!workOrder || (!actor.admin && workOrder.manager_user_id !== actor.userId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
    return NextResponse.json({ ok: true, sent, skipped });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send to vendors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
