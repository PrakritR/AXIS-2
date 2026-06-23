import { NextRequest, NextResponse } from "next/server";
import { amendLeaseMoveOutDate, checkMoveOutAvailabilityForLease, hasBothLeaseSignatures } from "@/lib/lease-amendment.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

export const runtime = "nodejs";

function asObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? "").toLowerCase();
    if (role !== "manager" && role !== "admin") {
      return NextResponse.json({ error: "Managers only." }, { status: 403 });
    }

    const body = (await req.json()) as { leaseId?: string; newLeaseEnd?: string };
    const leaseId = (body.leaseId ?? "").trim();
    const newLeaseEnd = (body.newLeaseEnd ?? "").trim();
    if (!leaseId) return NextResponse.json({ error: "leaseId is required." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newLeaseEnd)) {
      return NextResponse.json({ error: "Provide a valid newLeaseEnd (YYYY-MM-DD)." }, { status: 400 });
    }

    const { data: leaseRecord } = await db
      .from("portal_lease_pipeline_records")
      .select("id, row_data, manager_user_id, property_id, resident_email")
      .eq("id", leaseId)
      .maybeSingle();
    if (!leaseRecord) return NextResponse.json({ error: "Lease not found." }, { status: 404 });

    if (role === "manager" && leaseRecord.manager_user_id && leaseRecord.manager_user_id !== user.id) {
      return NextResponse.json({ error: "You do not have access to this lease." }, { status: 403 });
    }

    const result = await amendLeaseMoveOutDate(db, leaseRecord, newLeaseEnd);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, newLeaseEnd: result.newLeaseEnd, direction: result.direction });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? "").toLowerCase();
    if (role !== "manager" && role !== "admin") {
      return NextResponse.json({ error: "Managers only." }, { status: 403 });
    }

    const body = (await req.json()) as { leaseId?: string; newLeaseEnd?: string };
    const leaseId = (body.leaseId ?? "").trim();
    const newLeaseEnd = (body.newLeaseEnd ?? "").trim();
    if (!leaseId || !/^\d{4}-\d{2}-\d{2}$/.test(newLeaseEnd)) {
      return NextResponse.json({ error: "Provide leaseId and valid newLeaseEnd (YYYY-MM-DD)." }, { status: 400 });
    }

    const { data: leaseRecord } = await db
      .from("portal_lease_pipeline_records")
      .select("id, row_data, manager_user_id, property_id, resident_email")
      .eq("id", leaseId)
      .maybeSingle();
    if (!leaseRecord) return NextResponse.json({ error: "Lease not found." }, { status: 404 });
    if (role === "manager" && leaseRecord.manager_user_id && leaseRecord.manager_user_id !== user.id) {
      return NextResponse.json({ error: "You do not have access to this lease." }, { status: 403 });
    }

    const leaseRow = leaseRecord.row_data as LeasePipelineRow;
    if (!hasBothLeaseSignatures(leaseRow) || leaseRow.status === "Voided") {
      return NextResponse.json({ available: true, direction: "extend" });
    }

    const availability = await checkMoveOutAvailabilityForLease(db, leaseRow, leaseRecord, newLeaseEnd);
    if (availability.ok) {
      return NextResponse.json({ available: true, direction: availability.direction });
    }
    return NextResponse.json({
      available: false,
      direction: availability.direction,
      reason: availability.reason,
      nextAvailableDate: availability.nextAvailableDate ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
