import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
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

function normalizeRow(row: DemoApplicantRow): DemoApplicantRow {
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const id = normalizeApplicationAxisId(row.id);
  return {
    ...row,
    id,
    propertyId: row.propertyId || propertyId || undefined,
    assignedPropertyId: row.assignedPropertyId || undefined,
    email: row.email?.trim().toLowerCase() || row.email,
  };
}

async function persistNormalizedRow(db: ReturnType<typeof createSupabaseServiceRoleClient>, oldId: string, row: DemoApplicantRow) {
  if (oldId !== row.id) {
    await db.from("manager_application_records").delete().eq("id", oldId);
  }
  await db.from("manager_application_records").upsert(
    {
      id: row.id,
      manager_user_id: row.managerUserId || null,
      resident_email: row.email?.trim().toLowerCase() || null,
      property_id: row.propertyId || row.application?.propertyId || null,
      assigned_property_id: row.assignedPropertyId || null,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();

    let query = db
      .from("manager_application_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false });

    if (!admin && role === "resident") {
      query = query.eq("resident_email", email);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byId = new Map<string, DemoApplicantRow>();
    for (const record of data ?? []) {
      if (!record.row_data) continue;
      const row = normalizeRow(record.row_data as DemoApplicantRow);
      byId.set(row.id, { ...byId.get(row.id), ...row });
      if (record.id !== row.id || (record.row_data as DemoApplicantRow).id !== row.id) {
        await persistNormalizedRow(db, record.id, row);
      }
    }
    const rows = [...byId.values()];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load applications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "replace";
      id?: string;
      row?: DemoApplicantRow;
      rows?: DemoApplicantRow[];
    };
    const db = createSupabaseServiceRoleClient();

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows) ? body.rows.map(normalizeRow) : [];
      for (const row of rows) {
        await db.from("manager_application_records").upsert(
          {
            id: row.id,
            manager_user_id: row.managerUserId || null,
            resident_email: row.email?.trim().toLowerCase() || null,
            property_id: row.propertyId || row.application?.propertyId || null,
            assigned_property_id: row.assignedPropertyId || null,
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
      const { error } = await db.from("manager_application_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    const row = normalizeRow(body.row);
    const { error } = await db.from("manager_application_records").upsert(
      {
        id: row.id,
        manager_user_id: row.managerUserId || null,
        resident_email: row.email?.trim().toLowerCase() || null,
        property_id: row.propertyId || row.application?.propertyId || null,
        assigned_property_id: row.assignedPropertyId || null,
        row_data: row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save application.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
