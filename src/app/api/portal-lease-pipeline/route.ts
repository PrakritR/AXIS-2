import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import {
  fetchLeasesForManagerUser,
  managerCanAccessLeaseRecord,
  type LeaseScopeRecord,
} from "@/lib/auth/manager-lease-scope";
import { autoFileLeaseDocument, type AutoFileLeaseRow } from "@/lib/documents/document-auto-file-hooks.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RecordUser = { id: string; email?: string | null; role: string };

async function getUserContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const admin = await isAdminUser(user.id);
  return {
    db,
    user: {
      id: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      role: admin ? "admin" : String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
    } satisfies RecordUser,
  };
}

function normalizeRow(row: Record<string, unknown>) {
  return row;
}

function buildUpsert(row: Record<string, unknown>) {
  return {
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    resident_user_id: row.residentUserId ?? row.resident_user_id ?? null,
    resident_email: row.residentEmail ?? row.resident_email ?? null,
    property_id: row.propertyId ?? row.property_id ?? null,
    status: row.bucket ?? row.status ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let records: LeaseScopeRecord[] = [];

    if (ctx.user.role === "admin") {
      const { data, error } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, row_data, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      records = (data ?? []) as LeaseScopeRecord[];
    } else if (ctx.user.role === "resident") {
      const { data, error } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, row_data, updated_at")
        .or(`resident_user_id.eq.${ctx.user.id},resident_email.eq.${ctx.user.email ?? ""}`)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      records = (data ?? []) as LeaseScopeRecord[];
    } else {
      records = await fetchLeasesForManagerUser(ctx.db, ctx.user.id);
    }

    const rows = records.map((record) => {
      const row = (record.row_data && typeof record.row_data === "object" ? record.row_data : record) as Record<
        string,
        unknown
      >;
      return normalizeRow(row);
    });

    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "deleteIds" | "replace";
      id?: string;
      ids?: unknown[];
      row?: Record<string, unknown>;
      rows?: Record<string, unknown>[];
    };

    if (body.action === "delete" || body.action === "deleteIds") {
      const ids =
        body.action === "deleteIds"
          ? (Array.isArray(body.ids) ? body.ids.map(String) : [])
          : [body.id?.trim() ?? ""];
      if (ids.length === 0 || ids.some((id) => !id)) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      for (const id of ids) {
        const { data: existing } = await ctx.db
          .from("portal_lease_pipeline_records")
          .select("id, manager_user_id, property_id")
          .eq("id", id)
          .limit(1);
        const record = (existing ?? [])[0] as LeaseScopeRecord | undefined;
        if (!record) continue;
        if (ctx.user.role !== "admin") {
          if (ctx.user.role === "resident") continue;
          const allowed = await managerCanAccessLeaseRecord(ctx.db, ctx.user.id, record, "delete");
          if (!allowed) continue;
        }
        await ctx.db.from("portal_lease_pipeline_records").delete().eq("id", id);
      }
      return NextResponse.json({ ok: true });
    }

    const rows = body.action === "replace" ? (body.rows ?? []) : body.row ? [body.row] : [];
    if (rows.length === 0) return NextResponse.json({ error: "row required" }, { status: 400 });

    for (const row of rows) {
      const normalized = normalizeRow(row);
      let record = buildUpsert(normalized);
      if (!record.id) return NextResponse.json({ error: "row id required" }, { status: 400 });
      const id = String(record.id);

      const { data: existing, error: existingError } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, manager_user_id, property_id, row_data")
        .eq("id", id)
        .limit(1);
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

      const recordExists = Array.isArray(existing) && existing.length > 0;
      const existingRecord = (existing ?? [])[0] as (LeaseScopeRecord & { row_data?: Record<string, unknown> }) | undefined;

      if (recordExists && ctx.user.role !== "admin") {
        if (ctx.user.role === "resident") {
          const { data: visible } = await ctx.db
            .from("portal_lease_pipeline_records")
            .select("id")
            .eq("id", id)
            .or(`resident_user_id.eq.${ctx.user.id},resident_email.eq.${ctx.user.email ?? ""}`)
            .limit(1);
          if (!Array.isArray(visible) || visible.length === 0) {
            return NextResponse.json({ error: "Record not found." }, { status: 404 });
          }
        } else {
          const allowed = existingRecord
            ? await managerCanAccessLeaseRecord(ctx.db, ctx.user.id, existingRecord, "edit")
            : false;
          if (!allowed) return NextResponse.json({ error: "Record not found." }, { status: 404 });
          // Preserve server-trusted ownership on update.
          record = {
            ...record,
            manager_user_id: existingRecord?.manager_user_id ?? ctx.user.id,
          };
        }
      }

      if (!recordExists && ctx.user.role !== "admin") {
        record = { ...record, manager_user_id: ctx.user.id };
      }

      const { error } = await ctx.db.from("portal_lease_pipeline_records").upsert(record, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Auto-file the signed lease into the document library on the transition
      // into fully-signed (once), so repeated syncs of the same row don't
      // duplicate. No-op unless the manager opted the "lease" category in.
      const previouslySigned = Boolean((existingRecord?.row_data as { fullySignedAt?: unknown } | undefined)?.fullySignedAt);
      const nowSigned = Boolean((normalized as { fullySignedAt?: unknown }).fullySignedAt);
      if (nowSigned && !previouslySigned) {
        await autoFileLeaseDocument(ctx.db, normalized as AutoFileLeaseRow).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
