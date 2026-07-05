import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { buildVendorBidAcceptedEmail, buildVendorBidDeclinedEmail } from "@/lib/vendor-visit-email";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

type BidRecord = {
  id: string;
  work_order_id: string;
  vendor_user_id: string;
  vendor_directory_id: string | null;
  manager_user_id: string;
  amount_cents: number;
  proposed_time: string;
  note: string | null;
  status: "submitted" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
};

type BidJson = {
  id: string;
  workOrderId: string;
  vendorUserId: string;
  vendorDirectoryId: string | null;
  vendorName?: string;
  vendorEmail?: string;
  amountCents: number;
  proposedTime: string;
  note: string | null;
  status: "submitted" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
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

async function vendorNamesById(db: Db, ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return out;
  const { data } = await db.from("manager_vendor_records").select("id, row_data").in("id", uniqueIds);
  for (const row of data ?? []) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    out.set(row.id as string, { name: String(rowData.name ?? ""), email: String(rowData.email ?? "") });
  }
  return out;
}

function toJson(bid: BidRecord, vendors: Map<string, { name: string; email: string }>): BidJson {
  const vendor = bid.vendor_directory_id ? vendors.get(bid.vendor_directory_id) : undefined;
  return {
    id: bid.id,
    workOrderId: bid.work_order_id,
    vendorUserId: bid.vendor_user_id,
    vendorDirectoryId: bid.vendor_directory_id,
    vendorName: vendor?.name,
    vendorEmail: vendor?.email,
    amountCents: bid.amount_cents,
    proposedTime: bid.proposed_time,
    note: bid.note,
    status: bid.status,
    createdAt: bid.created_at,
    updatedAt: bid.updated_at,
  };
}

export async function GET(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const workOrderId = url.searchParams.get("workOrderId")?.trim();

    let query = db.from("work_order_bids").select("*").order("amount_cents", { ascending: true });
    if (!actor.admin && actor.role === "vendor") {
      query = query.eq("vendor_user_id", actor.userId);
    } else if (!actor.admin) {
      query = query.eq("manager_user_id", actor.userId);
    }
    if (workOrderId) query = query.eq("work_order_id", workOrderId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bids = (data ?? []) as BidRecord[];
    const vendors = await vendorNamesById(db, bids.map((b) => b.vendor_directory_id ?? ""));
    return NextResponse.json({ bids: bids.map((b) => toJson(b, vendors)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load bids.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function submitBid(
  db: Db,
  actor: NonNullable<Awaited<ReturnType<typeof sessionActor>>>,
  body: { workOrderId?: string; amountCents?: number; proposedTime?: string; note?: string },
) {
  if (actor.role !== "vendor") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const workOrderId = String(body.workOrderId ?? "").trim();
  const amountCents = Math.round(Number(body.amountCents));
  const proposedTime = String(body.proposedTime ?? "").trim();
  const note = String(body.note ?? "").trim().slice(0, 2000);

  if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter a valid bid amount." }, { status: 400 });
  }
  const proposedDate = new Date(proposedTime);
  if (Number.isNaN(proposedDate.getTime())) {
    return NextResponse.json({ error: "Enter a valid proposed date/time." }, { status: 400 });
  }

  const { data: workOrder } = await db
    .from("portal_work_order_records")
    .select("manager_user_id, vendor_user_id, row_data")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  // A vendor may bid if they're the currently assigned vendor, or if the manager sent
  // them a consultation/quote offer for this work order (several vendors can be offered
  // the same not-yet-assigned work order at once — see work_order_vendor_offers).
  const isAssignedVendor = workOrder.vendor_user_id === actor.userId;
  let isOfferedVendor = false;
  if (!isAssignedVendor) {
    const { data: offer } = await db
      .from("work_order_vendor_offers")
      .select("id")
      .eq("work_order_id", workOrderId)
      .eq("vendor_user_id", actor.userId)
      .eq("status", "sent")
      .maybeSingle();
    isOfferedVendor = Boolean(offer);
  }
  if (!isAssignedVendor && !isOfferedVendor) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const rowData = (workOrder.row_data ?? {}) as DemoManagerWorkOrderRow;
  if (!rowData.biddingOpen) {
    return NextResponse.json({ error: "Bidding is not open for this work order." }, { status: 400 });
  }

  const { data: existing } = await db
    .from("work_order_bids")
    .select("id, status")
    .eq("work_order_id", workOrderId)
    .eq("vendor_user_id", actor.userId)
    .maybeSingle();
  if (existing && existing.status !== "submitted") {
    return NextResponse.json({ error: "This bid has already been resolved." }, { status: 403 });
  }

  const { data: vendorDirectoryRow } = await db
    .from("manager_vendor_records")
    .select("id")
    .eq("vendor_user_id", actor.userId)
    .eq("manager_user_id", workOrder.manager_user_id)
    .maybeSingle();

  const record = {
    work_order_id: workOrderId,
    vendor_user_id: actor.userId,
    vendor_directory_id: (vendorDirectoryRow?.id as string | undefined) ?? null,
    manager_user_id: workOrder.manager_user_id,
    amount_cents: amountCents,
    proposed_time: proposedDate.toISOString(),
    note: note || null,
    status: "submitted" as const,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("work_order_bids")
    .upsert(existing ? { id: existing.id, ...record } : record, { onConflict: "work_order_id,vendor_user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  track("work_order_bid_submitted", actor.userId, { work_order_id: workOrderId });
  return NextResponse.json({ ok: true });
}

async function acceptBid(
  db: Db,
  actor: NonNullable<Awaited<ReturnType<typeof sessionActor>>>,
  body: { bidId?: string },
) {
  if (!actor.admin && actor.role !== "manager" && actor.role !== "pro") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const bidId = String(body.bidId ?? "").trim();
  if (!bidId) return NextResponse.json({ error: "Bid id required." }, { status: 400 });

  const { data: bid } = await db.from("work_order_bids").select("*").eq("id", bidId).maybeSingle();
  if (!bid) return NextResponse.json({ error: "Bid not found." }, { status: 404 });
  const record = bid as BidRecord;
  if (!actor.admin && record.manager_user_id !== actor.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (record.status !== "submitted") {
    return NextResponse.json({ error: "This bid has already been resolved." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: acceptError } = await db
    .from("work_order_bids")
    .update({ status: "accepted", updated_at: now })
    .eq("id", bidId);
  if (acceptError) return NextResponse.json({ error: acceptError.message }, { status: 500 });

  const { data: otherBids } = await db
    .from("work_order_bids")
    .select("*")
    .eq("work_order_id", record.work_order_id)
    .neq("id", bidId)
    .eq("status", "submitted");
  const declined = (otherBids ?? []) as BidRecord[];
  if (declined.length > 0) {
    await db
      .from("work_order_bids")
      .update({ status: "declined", updated_at: now })
      .in("id", declined.map((b) => b.id));
  }

  // Once a vendor is assigned, no other offered vendor should keep seeing this work
  // order in their portal (same "loses read access on reassignment" behavior as the
  // single-vendor Phase 2 flow) — withdraw every offer on this work order.
  await db
    .from("work_order_vendor_offers")
    .update({ status: "withdrawn", updated_at: now })
    .eq("work_order_id", record.work_order_id)
    .eq("status", "sent");

  const { data: workOrder } = await db
    .from("portal_work_order_records")
    .select("manager_user_id, resident_email, property_id, assigned_property_id, row_data")
    .eq("id", record.work_order_id)
    .maybeSingle();

  const vendors = await vendorNamesById(db, [record.vendor_directory_id ?? "", ...declined.map((b) => b.vendor_directory_id ?? "")]);
  const winningVendor = record.vendor_directory_id ? vendors.get(record.vendor_directory_id) : undefined;

  if (workOrder) {
    const rowData = (workOrder.row_data ?? {}) as DemoManagerWorkOrderRow;
    const nextRowData: DemoManagerWorkOrderRow = {
      ...rowData,
      vendorId: record.vendor_directory_id ?? undefined,
      vendorName: winningVendor?.name || rowData.vendorName,
      vendorAssignedAt: now,
      selfAssigned: false,
      cost: `$${(record.amount_cents / 100).toFixed(2)}`,
      biddingOpen: false,
      biddingResolvedAt: now,
    };
    await db
      .from("portal_work_order_records")
      .update({ vendor_user_id: record.vendor_user_id, row_data: nextRowData, updated_at: now })
      .eq("id", record.work_order_id);

    const propertyLabel = rowData.propertyName || "";
    const unit = rowData.unit || "";
    const workOrderTitle = rowData.title || "";

    if (winningVendor?.email?.includes("@")) {
      const { subject, body: messageBody } = buildVendorBidAcceptedEmail({
        vendorName: winningVendor.name,
        workOrderTitle,
        propertyLabel,
        unit,
      });
      await deliverPortalInboxMessage(db, {
        senderUserId: actor.userId,
        senderEmail: actor.email,
        fromName: actor.fullName || "Axis Portal",
        subject,
        text: messageBody,
        toUserIds: [record.vendor_user_id],
        deliverToPortalInbox: true,
        deliverViaEmail: false,
        deliverViaSms: false,
      });
    }

    for (const other of declined) {
      const otherVendor = other.vendor_directory_id ? vendors.get(other.vendor_directory_id) : undefined;
      if (!otherVendor) continue;
      const { subject, body: messageBody } = buildVendorBidDeclinedEmail({
        vendorName: otherVendor.name,
        workOrderTitle,
        propertyLabel,
        unit,
      });
      await deliverPortalInboxMessage(db, {
        senderUserId: actor.userId,
        senderEmail: actor.email,
        fromName: actor.fullName || "Axis Portal",
        subject,
        text: messageBody,
        toUserIds: [other.vendor_user_id],
        deliverToPortalInbox: true,
        deliverViaEmail: false,
        deliverViaSms: false,
      }).catch(() => undefined);
    }
  }

  track("work_order_bid_accepted", actor.userId, { work_order_id: record.work_order_id });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      action?: "submit" | "accept";
      workOrderId?: string;
      amountCents?: number;
      proposedTime?: string;
      note?: string;
      bidId?: string;
    };

    if (body.action === "accept") return acceptBid(db, actor, body);
    if (body.action === "submit") return submitBid(db, actor, body);
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save bid.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
