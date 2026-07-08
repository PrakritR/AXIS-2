import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { getPortalAccessContext } from "@/lib/auth/portal-access";
import { resolvePortalApiActorRole } from "@/lib/auth/vendor-api-access";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { resolveVendorNextAvailableSlot } from "@/lib/vendor-availability-server";
import { buildVendorBidAcceptedEmail, buildVendorBidDeclinedEmail } from "@/lib/vendor-visit-email";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Placeholder duration used only to keep a scheduled consultation from double-booking
 * against other pending consultations — the real job visit is scheduled separately once
 * priced (see scheduledAtIso on the work order). */
const CONSULTATION_VISIT_DURATION_MINUTES = 30;

type QuoteMode = "upfront" | "after_consultation";

type BidRecord = {
  id: string;
  work_order_id: string;
  vendor_user_id: string;
  vendor_directory_id: string | null;
  manager_user_id: string;
  quote_mode: QuoteMode;
  consultation_visit_at: string | null;
  amount_cents: number | null;
  materials_cents: number;
  proposed_time: string | null;
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
  quoteMode: QuoteMode;
  consultationVisitAt: string | null;
  amountCents: number | null;
  materialsCents: number;
  proposedTime: string | null;
  note: string | null;
  status: "submitted" | "accepted" | "declined";
  createdAt: string;
  updatedAt: string;
};

async function sessionActor(db: Db) {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) return null;
  const admin = await isAdminUser(ctx.user.id);
  const role = resolvePortalApiActorRole(ctx);
  return {
    userId: ctx.user.id,
    email: (ctx.profile?.email ?? ctx.user.email ?? "").trim().toLowerCase(),
    fullName: ctx.profile?.full_name?.trim() || "",
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

async function vendorDirectoryIdsForUser(db: Db, vendorUserId: string, managerUserId?: string): Promise<string[]> {
  let query = db.from("manager_vendor_records").select("id").eq("vendor_user_id", vendorUserId);
  if (managerUserId) query = query.eq("manager_user_id", managerUserId);
  const { data } = await query;
  return (data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
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
    quoteMode: bid.quote_mode,
    consultationVisitAt: bid.consultation_visit_at,
    amountCents: bid.amount_cents,
    materialsCents: bid.materials_cents,
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

type WorkOrderAccess = { managerUserId: string; rowData: DemoManagerWorkOrderRow };

/** A vendor may act on a work order if they're the currently assigned vendor, or if the
 * manager sent them a consultation/quote offer for it — while bidding is open, or while a
 * post-consultation price is still pending on their placeholder bid. */
async function resolveVendorWorkOrderAccess(
  db: Db,
  actor: NonNullable<Awaited<ReturnType<typeof sessionActor>>>,
  workOrderId: string,
): Promise<{ ok: true; access: WorkOrderAccess } | { ok: false; response: NextResponse }> {
  const { data: workOrder } = await db
    .from("portal_work_order_records")
    .select("manager_user_id, vendor_user_id, row_data")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder) return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };

  const isAssignedVendor = workOrder.vendor_user_id === actor.userId;
  let isOfferedVendor = false;
  if (!isAssignedVendor) {
    const vendorDirectoryIds = await vendorDirectoryIdsForUser(db, actor.userId);
    const { data: offerByUser } = await db
      .from("work_order_vendor_offers")
      .select("id")
      .eq("work_order_id", workOrderId)
      .eq("vendor_user_id", actor.userId)
      .eq("status", "sent")
      .maybeSingle();
    isOfferedVendor = Boolean(offerByUser);
    if (!isOfferedVendor && vendorDirectoryIds.length > 0) {
      const { data: offerByDirectory } = await db
        .from("work_order_vendor_offers")
        .select("id")
        .eq("work_order_id", workOrderId)
        .in("vendor_directory_id", vendorDirectoryIds)
        .eq("status", "sent")
        .limit(1);
      isOfferedVendor = Boolean(offerByDirectory?.length);
    }
  }
  if (!isAssignedVendor && !isOfferedVendor) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  const rowData = (workOrder.row_data ?? {}) as DemoManagerWorkOrderRow;
  if (!rowData.biddingOpen) {
    const { data: pendingBid } = await db
      .from("work_order_bids")
      .select("quote_mode, amount_cents, consultation_visit_at, status")
      .eq("work_order_id", workOrderId)
      .eq("vendor_user_id", actor.userId)
      .maybeSingle();
    const pricingPending =
      pendingBid?.status === "submitted" &&
      pendingBid.quote_mode === "after_consultation" &&
      pendingBid.consultation_visit_at &&
      pendingBid.amount_cents == null;
    if (!pricingPending) {
      return { ok: false, response: NextResponse.json({ error: "Bidding is not open for this work order." }, { status: 400 }) };
    }
  }
  return { ok: true, access: { managerUserId: workOrder.manager_user_id as string, rowData } };
}

async function submitBid(
  db: Db,
  actor: NonNullable<Awaited<ReturnType<typeof sessionActor>>>,
  body: { workOrderId?: string; amountCents?: number; materialsCents?: number; proposedTime?: string; note?: string },
) {
  if (actor.role !== "vendor") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const workOrderId = String(body.workOrderId ?? "").trim();
  const amountCents = Math.round(Number(body.amountCents));
  const materialsCents = body.materialsCents === undefined ? 0 : Math.round(Number(body.materialsCents));
  const proposedTime = String(body.proposedTime ?? "").trim();
  const note = String(body.note ?? "").trim().slice(0, 2000);

  if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter a valid labor cost." }, { status: 400 });
  }
  if (!Number.isFinite(materialsCents) || materialsCents < 0) {
    return NextResponse.json({ error: "Enter a valid equipment/materials cost." }, { status: 400 });
  }
  const proposedDate = new Date(proposedTime);
  if (Number.isNaN(proposedDate.getTime())) {
    return NextResponse.json({ error: "Enter a valid proposed date/time." }, { status: 400 });
  }

  const access = await resolveVendorWorkOrderAccess(db, actor, workOrderId);
  if (!access.ok) return access.response;

  const { data: existing } = await db
    .from("work_order_bids")
    .select("id, status, quote_mode, consultation_visit_at")
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
    .eq("manager_user_id", access.access.managerUserId)
    .maybeSingle();

  const record = {
    work_order_id: workOrderId,
    vendor_user_id: actor.userId,
    vendor_directory_id: (vendorDirectoryRow?.id as string | undefined) ?? null,
    manager_user_id: access.access.managerUserId,
    quote_mode: (existing?.quote_mode as QuoteMode | undefined) ?? "upfront",
    consultation_visit_at: existing?.consultation_visit_at ?? null,
    amount_cents: amountCents,
    materials_cents: materialsCents,
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

/** Vendor's first step of the "quote after consultation" mode: book (or manually set) a
 * consultation visit and save a pricing-pending placeholder bid row. The vendor prices the
 * job afterward via submitBid, which preserves quote_mode/consultation_visit_at. */
async function scheduleConsultation(
  db: Db,
  actor: NonNullable<Awaited<ReturnType<typeof sessionActor>>>,
  body: { workOrderId?: string; mode?: "auto" | "manual"; consultationVisitAt?: string; note?: string },
) {
  if (actor.role !== "vendor") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const workOrderId = String(body.workOrderId ?? "").trim();
  if (!workOrderId) return NextResponse.json({ error: "Work order id required." }, { status: 400 });

  const access = await resolveVendorWorkOrderAccess(db, actor, workOrderId);
  if (!access.ok) return access.response;

  const { data: existing } = await db
    .from("work_order_bids")
    .select("id, status, amount_cents, materials_cents, proposed_time, note")
    .eq("work_order_id", workOrderId)
    .eq("vendor_user_id", actor.userId)
    .maybeSingle();
  if (existing && existing.status !== "submitted") {
    return NextResponse.json({ error: "This bid has already been resolved." }, { status: 403 });
  }

  let consultationVisitAt: string;
  if (body.mode === "manual") {
    const parsed = new Date(String(body.consultationVisitAt ?? ""));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Enter a valid consultation date/time." }, { status: 400 });
    }
    consultationVisitAt = parsed.toISOString();
  } else {
    const { data: otherConsultations } = await db
      .from("work_order_bids")
      .select("consultation_visit_at")
      .eq("vendor_user_id", actor.userId)
      .eq("status", "submitted")
      .not("consultation_visit_at", "is", null)
      .neq("work_order_id", workOrderId);
    const extraBusy = (otherConsultations ?? [])
      .map((r) => r.consultation_visit_at as string | null)
      .filter((iso): iso is string => Boolean(iso))
      .map((iso) => ({
        startIso: iso,
        endIso: new Date(new Date(iso).getTime() + CONSULTATION_VISIT_DURATION_MINUTES * 60_000).toISOString(),
      }));
    const { iso, reason } = await resolveVendorNextAvailableSlot(db, actor.userId, {
      durationMinutes: CONSULTATION_VISIT_DURATION_MINUTES,
      extraBusy,
      excludeWorkOrderId: workOrderId,
    });
    if (!iso) {
      return NextResponse.json(
        {
          error:
            reason === "no_availability"
              ? "Set your availability first, then try again."
              : "No open slot found in your availability.",
        },
        { status: 400 },
      );
    }
    consultationVisitAt = iso;
  }

  const note = String(body.note ?? existing?.note ?? "").trim().slice(0, 2000);

  const { data: vendorDirectoryRow } = await db
    .from("manager_vendor_records")
    .select("id")
    .eq("vendor_user_id", actor.userId)
    .eq("manager_user_id", access.access.managerUserId)
    .maybeSingle();

  const record = {
    work_order_id: workOrderId,
    vendor_user_id: actor.userId,
    vendor_directory_id: (vendorDirectoryRow?.id as string | undefined) ?? null,
    manager_user_id: access.access.managerUserId,
    quote_mode: "after_consultation" as const,
    consultation_visit_at: consultationVisitAt,
    amount_cents: existing?.amount_cents ?? null,
    materials_cents: existing?.materials_cents ?? 0,
    proposed_time: existing?.proposed_time ?? null,
    note: note || null,
    status: "submitted" as const,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("work_order_bids")
    .upsert(existing ? { id: existing.id, ...record } : record, { onConflict: "work_order_id,vendor_user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  track("work_order_consultation_scheduled", actor.userId, { work_order_id: workOrderId });
  return NextResponse.json({ ok: true, consultationVisitAt });
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
  if (record.amount_cents == null) {
    return NextResponse.json(
      { error: "This vendor hasn't priced the job yet — it's still pending their consultation." },
      { status: 400 },
    );
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
    const totalCents = record.amount_cents + record.materials_cents;
    const nextRowData: DemoManagerWorkOrderRow = {
      ...rowData,
      vendorId: record.vendor_directory_id ?? undefined,
      vendorName: winningVendor?.name || rowData.vendorName,
      vendorAssignedAt: now,
      selfAssigned: false,
      cost: `$${(totalCents / 100).toFixed(2)}`,
      vendorCostCents: record.amount_cents,
      materialsCostCents: record.materials_cents,
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
      // Best-effort notification: the bid + work-order reassignment above have already
      // committed, so a delivery failure here must not surface as an "accept failed" error.
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
      }).catch(() => undefined);
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
      action?: "submit" | "accept" | "schedule_consultation";
      workOrderId?: string;
      amountCents?: number;
      materialsCents?: number;
      proposedTime?: string;
      note?: string;
      bidId?: string;
      mode?: "auto" | "manual";
      consultationVisitAt?: string;
    };

    if (body.action === "accept") return acceptBid(db, actor, body);
    if (body.action === "submit") return submitBid(db, actor, body);
    if (body.action === "schedule_consultation") return scheduleConsultation(db, actor, body);
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save bid.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
