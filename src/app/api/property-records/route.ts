import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { propertyRowsToSnapshot, type ManagerPropertyRecordStatus } from "@/lib/persisted-property-records";

export const runtime = "nodejs";

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const admin = await isAdminUser(user.id);
    const db = createSupabaseServiceRoleClient();
    let query = db
      .from("manager_property_records")
      .select("id, manager_user_id, status, row_data, property_data, edit_request_note")
      .order("updated_at", { ascending: false });
    if (!admin) query = query.eq("manager_user_id", user.id);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ snapshot: propertyRowsToSnapshot(data ?? []) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load property records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = (await req.json()) as {
      action?: "upsert" | "delete";
      id?: string;
      managerUserId?: string | null;
      status?: ManagerPropertyRecordStatus;
      rowData?: unknown;
      propertyData?: unknown;
      editRequestNote?: string | null;
    };
    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await isAdminUser(user.id);
    const managerUserId = body.managerUserId?.trim() || user.id;
    if (!admin && managerUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const db = createSupabaseServiceRoleClient();
    if (body.action === "delete") {
      const { error } = await db.from("manager_property_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 });
    const { error } = await db.from("manager_property_records").upsert(
      {
        id,
        manager_user_id: managerUserId,
        status: body.status,
        row_data: body.rowData ?? null,
        property_data: body.propertyData ?? null,
        edit_request_note: body.editRequestNote ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save property record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
