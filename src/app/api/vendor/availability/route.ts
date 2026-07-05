import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { VendorAvailabilityRule } from "@/lib/vendor-availability";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

type RuleRecord = {
  id: string;
  vendor_user_id: string;
  kind: "weekly" | "block" | "open";
  weekday: number | null;
  specific_date: string | null;
  start_minute: number;
  end_minute: number;
  note: string | null;
};

function toJson(rule: RuleRecord): VendorAvailabilityRule {
  if (rule.kind === "weekly") {
    return { id: rule.id, kind: "weekly", weekday: rule.weekday as number, startMinute: rule.start_minute, endMinute: rule.end_minute, note: rule.note };
  }
  return { id: rule.id, kind: rule.kind, specificDate: rule.specific_date as string, startMinute: rule.start_minute, endMinute: rule.end_minute, note: rule.note };
}

async function sessionActor(db: Db) {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  return { userId: user.id, role };
}

/** Manager -> the vendor_user_id of a directory row they own, or null if unresolvable/unlinked. */
async function resolveManagerOwnedVendorUserId(db: Db, managerUserId: string, vendorDirectoryId: string): Promise<string | null> {
  const { data } = await db
    .from("manager_vendor_records")
    .select("vendor_user_id")
    .eq("id", vendorDirectoryId)
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  return (data?.vendor_user_id as string | null) ?? null;
}

export async function GET(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const vendorId = url.searchParams.get("vendorId")?.trim();

    let vendorUserId: string | null;
    if (vendorId) {
      // A manager reading a specific vendor's availability — must own that vendor relationship.
      if (actor.role !== "manager" && actor.role !== "pro") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      vendorUserId = await resolveManagerOwnedVendorUserId(db, actor.userId, vendorId);
      if (!vendorUserId) return NextResponse.json({ rules: [] });
    } else {
      if (actor.role !== "vendor") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      vendorUserId = actor.userId;
    }

    const { data, error } = await db
      .from("vendor_availability_rules")
      .select("id, vendor_user_id, kind, weekday, specific_date, start_minute, end_minute, note")
      .eq("vendor_user_id", vendorUserId)
      .order("kind", { ascending: true })
      .order("weekday", { ascending: true, nullsFirst: true })
      .order("specific_date", { ascending: true, nullsFirst: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rules: (data ?? []).map((r) => toJson(r as RuleRecord)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function validMinuteRange(startMinute: unknown, endMinute: unknown): { start: number; end: number } | null {
  const start = Number(startMinute);
  const end = Number(endMinute);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end > 1440 || start >= end) return null;
  return { start: Math.round(start), end: Math.round(end) };
}

export async function POST(req: Request) {
  try {
    const db = createSupabaseServiceRoleClient();
    const actor = await sessionActor(db);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (actor.role !== "vendor") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      action?: "upsert-weekly" | "upsert-block" | "upsert-open" | "delete";
      id?: string;
      weekday?: number;
      specificDate?: string;
      startMinute?: number;
      endMinute?: number;
      note?: string;
    };

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "Rule id required." }, { status: 400 });
      const { error } = await db.from("vendor_availability_rules").delete().eq("id", id).eq("vendor_user_id", actor.userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsert-weekly") {
      const weekday = Number(body.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return NextResponse.json({ error: "Choose a valid day of week." }, { status: 400 });
      }
      const range = validMinuteRange(body.startMinute, body.endMinute);
      if (!range) return NextResponse.json({ error: "Choose a valid time window." }, { status: 400 });

      const now = new Date().toISOString();
      const row = {
        vendor_user_id: actor.userId,
        kind: "weekly" as const,
        weekday,
        specific_date: null,
        start_minute: range.start,
        end_minute: range.end,
        note: body.note?.trim().slice(0, 500) || null,
        updated_at: now,
      };
      const query = body.id
        ? db.from("vendor_availability_rules").update(row).eq("id", body.id).eq("vendor_user_id", actor.userId)
        : db.from("vendor_availability_rules").insert(row);
      const { data, error } = await query
        .select("id, vendor_user_id, kind, weekday, specific_date, start_minute, end_minute, note")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, rule: toJson(data as RuleRecord) });
    }

    if (body.action === "upsert-block") {
      const specificDate = String(body.specificDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(specificDate)) {
        return NextResponse.json({ error: "Choose a valid date to block." }, { status: 400 });
      }
      const range = validMinuteRange(body.startMinute ?? 0, body.endMinute ?? 1440);
      if (!range) return NextResponse.json({ error: "Choose a valid time window." }, { status: 400 });

      const now = new Date().toISOString();
      const row = {
        vendor_user_id: actor.userId,
        kind: "block" as const,
        weekday: null,
        specific_date: specificDate,
        start_minute: range.start,
        end_minute: range.end,
        note: body.note?.trim().slice(0, 500) || null,
        updated_at: now,
      };
      const query = body.id
        ? db.from("vendor_availability_rules").update(row).eq("id", body.id).eq("vendor_user_id", actor.userId)
        : db.from("vendor_availability_rules").insert(row);
      const { data, error } = await query
        .select("id, vendor_user_id, kind, weekday, specific_date, start_minute, end_minute, note")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, rule: toJson(data as RuleRecord) });
    }

    if (body.action === "upsert-open") {
      const specificDate = String(body.specificDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(specificDate)) {
        return NextResponse.json({ error: "Choose a valid date to open." }, { status: 400 });
      }
      const range = validMinuteRange(body.startMinute ?? 0, body.endMinute ?? 1440);
      if (!range) return NextResponse.json({ error: "Choose a valid time window." }, { status: 400 });

      const now = new Date().toISOString();
      const row = {
        vendor_user_id: actor.userId,
        kind: "open" as const,
        weekday: null,
        specific_date: specificDate,
        start_minute: range.start,
        end_minute: range.end,
        note: body.note?.trim().slice(0, 500) || null,
        updated_at: now,
      };
      const query = body.id
        ? db.from("vendor_availability_rules").update(row).eq("id", body.id).eq("vendor_user_id", actor.userId)
        : db.from("vendor_availability_rules").insert(row);
      const { data, error } = await query
        .select("id, vendor_user_id, kind, weekday, specific_date, start_minute, end_minute, note")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, rule: toJson(data as RuleRecord) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
