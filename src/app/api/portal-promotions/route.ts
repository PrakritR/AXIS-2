import { NextResponse } from "next/server";
import {
  normalizePromotionTemplate,
  sanitizeFlyerImages,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import { type PromotionTextEntry } from "@/lib/promotion-text";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { linkedOwnerScopeForModule, linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { assertManagerPromotionCoManagerAccess } from "@/lib/auth/co-manager-access";
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
    template: normalizePromotionTemplate(row.template),
    // Re-validate uploaded photos server-side: data:image/* base64 only, capped.
    inputs: { ...row.inputs, images: sanitizeFlyerImages(row.inputs?.images) },
    flyerCopies: Array.isArray(row.flyerCopies)
      ? row.flyerCopies.map((entry) => ({
          ...entry,
          title: String(entry.title ?? "").trim(),
          template: normalizePromotionTemplate(entry.template),
          inputs: { ...entry.inputs, images: sanitizeFlyerImages(entry.inputs?.images) },
        }))
      : row.flyerCopies,
    textCopies: Array.isArray(row.textCopies)
      ? row.textCopies.map((entry: PromotionTextEntry) => ({
          ...entry,
          title: String(entry.title ?? "").trim(),
        }))
      : row.textCopies,
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

    const ownQuery = db
      .from("manager_promotion_records")
      .select("row_data, updated_at, manager_user_id")
      .order("updated_at", { ascending: false })
      .limit(500);

    const { data, error } = admin ? await ownQuery : await ownQuery.eq("manager_user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byId = new Map<string, ManagerPromotionRow>();
    for (const record of data ?? []) {
      const row = record.row_data as ManagerPromotionRow | null;
      if (row?.id) byId.set(String(row.id), row);
    }

    // Co-manager access: include a linked owner's promotions on properties where
    // this user holds the `promotion` grant (empty perms = full, per moduleAllowed).
    if (!admin) {
      const { ownerIds } = await linkedOwnerScopeForModule(db, user.id, "promotion");
      ownerIds.delete(user.id);
      const linkedPropertyIds = await linkedPropertyIdsForModule(db, user.id, "promotion");
      if (ownerIds.size > 0 && linkedPropertyIds.size > 0) {
        const { data: linkedData, error: linkedError } = await db
          .from("manager_promotion_records")
          .select("row_data, updated_at, manager_user_id")
          .in("manager_user_id", [...ownerIds])
          .order("updated_at", { ascending: false })
          .limit(500);
        if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 });
        for (const record of linkedData ?? []) {
          const row = record.row_data as ManagerPromotionRow | null;
          const pid = row?.propertyId ? String(row.propertyId) : "";
          if (!row?.id || !pid || !linkedPropertyIds.has(pid)) continue;
          if (!byId.has(String(row.id))) byId.set(String(row.id), row);
        }
      }
    }

    return NextResponse.json({ rows: [...byId.values()] });
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
      const failedIds: string[] = [];
      for (const row of rows) {
        const { error } = await db.from("manager_promotion_records").upsert(
          { id: row.id, manager_user_id: managerUserId, row_data: row, updated_at: row.updatedAt },
          { onConflict: "id" },
        );
        if (error) failedIds.push(row.id);
      }
      if (failedIds.length > 0) {
        return NextResponse.json({ ok: false, error: "Some promotions failed to save.", failedIds }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (!admin) {
        const { data: existing } = await db
          .from("manager_promotion_records")
          .select("manager_user_id, row_data")
          .eq("id", id)
          .maybeSingle();
        const existingOwner = existing?.manager_user_id ? String(existing.manager_user_id) : null;
        // A co-manager with the promotion DELETE grant may remove a linked
        // owner's promotion; otherwise deletion stays scoped to own rows.
        if (existingOwner && existingOwner !== managerUserId) {
          const pid = String((existing?.row_data as ManagerPromotionRow | null)?.propertyId ?? "").trim();
          const gate = await assertManagerPromotionCoManagerAccess(db, managerUserId, pid || null, existingOwner, "delete");
          if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
          const { error } = await db.from("manager_promotion_records").delete().eq("id", id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ ok: true });
        }
      }
      let query = db.from("manager_promotion_records").delete().eq("id", id);
      if (!admin) query = query.eq("manager_user_id", managerUserId);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    const id = String(body.row.id).trim();
    const { data: existing } = await db
      .from("manager_promotion_records")
      .select("manager_user_id, row_data")
      .eq("id", id)
      .maybeSingle();
    const existingOwner = existing?.manager_user_id ? String(existing.manager_user_id) : null;
    // Owner to attribute the write to: a co-manager editing a linked owner's
    // promotion must (a) hold the promotion EDIT grant and (b) preserve the
    // owner id (never re-own the row to themselves).
    let ownerForWrite = managerUserId;
    if (existingOwner && !admin && existingOwner !== managerUserId) {
      const pid = String(
        (body.row as ManagerPromotionRow).propertyId ??
          (existing?.row_data as ManagerPromotionRow | null)?.propertyId ??
          "",
      ).trim();
      const gate = await assertManagerPromotionCoManagerAccess(db, managerUserId, pid || null, existingOwner, "edit");
      if (!gate.ok) {
        return NextResponse.json({ error: "Cannot edit another manager's promotion." }, { status: gate.status });
      }
      ownerForWrite = existingOwner;
    }

    const row = normalizeRow(body.row, ownerForWrite);
    const { error } = await db.from("manager_promotion_records").upsert(
      { id: row.id, manager_user_id: ownerForWrite, row_data: row, updated_at: row.updatedAt },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save promotion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
