import { NextResponse } from "next/server";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
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

function normalizeRow(row: ManagerPromotionRow, managerUserId: string): ManagerPromotionRow {
  return {
    ...row,
    id: String(row.id).trim(),
    managerUserId,
    propertyId: row.propertyId ? String(row.propertyId) : null,
    propertyLabel: String(row.propertyLabel ?? "").trim(),
    title: String(row.title ?? "").trim(),
    flyerSize: row.flyerSize ?? "letter",
    status: row.status === "generated" ? "generated" : "draft",
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
      .from("manager_promotion_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (!admin) {
      query = query.eq("manager_user_id", user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((record) => record.row_data).filter(Boolean) as ManagerPromotionRow[];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load promotions.";
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
      row?: ManagerPromotionRow;
      rows?: ManagerPromotionRow[];
    };

    const managerUserId = user.id;

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows)
        ? body.rows
            .filter((r) => !r.managerUserId || r.managerUserId === managerUserId)
            .map((r) => normalizeRow(r, managerUserId))
        : [];
      for (const row of rows) {
        await db.from("manager_promotion_records").upsert(
          { id: row.id, manager_user_id: managerUserId, row_data: row, updated_at: row.updatedAt },
          { onConflict: "id" },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let query = db.from("manager_promotion_records").delete().eq("id", id);
      if (!admin) query = query.eq("manager_user_id", managerUserId);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    // On an existing row, block writing over another manager's promotion.
    const id = String(body.row.id).trim();
    const { data: existing } = await db
      .from("manager_promotion_records")
      .select("manager_user_id")
      .eq("id", id)
      .maybeSingle();
    if (existing && !admin && existing.manager_user_id && existing.manager_user_id !== managerUserId) {
      return NextResponse.json({ error: "Cannot edit another manager's promotion." }, { status: 403 });
    }

    const row = normalizeRow(body.row, managerUserId);
    const { error } = await db.from("manager_promotion_records").upsert(
      { id: row.id, manager_user_id: managerUserId, row_data: row, updated_at: row.updatedAt },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save promotion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
