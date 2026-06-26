import { NextResponse } from "next/server";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function normalizeRow(row: ManagerVendorRow, managerUserId: string): ManagerVendorRow {
  return {
    ...row,
    id: row.id.trim(),
    managerUserId,
    name: row.name.trim(),
    trade: row.trade.trim(),
    phone: row.phone.trim(),
    email: row.email.trim().toLowerCase(),
    notes: row.notes.trim(),
    active: row.active !== false,
    propertyIds: Array.isArray(row.propertyIds) ? row.propertyIds : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();

    if (!admin && role !== "manager" && role !== "pro") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let query = db
      .from("manager_vendor_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (!admin) {
      query = query.eq("manager_user_id", user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((record) => record.row_data).filter(Boolean) as ManagerVendorRow[];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load vendors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    const admin = await isAdminUser(user.id);

    if (!admin && role !== "manager" && role !== "pro") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "replace";
      id?: string;
      row?: ManagerVendorRow;
      rows?: ManagerVendorRow[];
    };

    const managerUserId = user.id;

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows) ? body.rows.map((r) => normalizeRow(r, managerUserId)) : [];
      for (const row of rows) {
        await db.from("manager_vendor_records").upsert(
          {
            id: row.id,
            manager_user_id: managerUserId,
            row_data: row,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let query = db.from("manager_vendor_records").delete().eq("id", id);
      if (!admin) query = query.eq("manager_user_id", managerUserId);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    const row = normalizeRow(body.row, managerUserId);
    const { error } = await db.from("manager_vendor_records").upsert(
      {
        id: row.id,
        manager_user_id: managerUserId,
        row_data: row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save vendor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
