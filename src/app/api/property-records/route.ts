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
    const baseQuery = db
      .from("manager_property_records")
      .select("id, manager_user_id, status, row_data, property_data, edit_request_note")
      .order("updated_at", { ascending: false });
    if (admin) {
      const { data, error } = await baseQuery;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ snapshot: propertyRowsToSnapshot(data ?? []) });
    }

    const { data: linkRows, error: linkError } = await db
      .from("account_link_invites")
      .select("assigned_property_ids")
      .eq("status", "accepted")
      .or(`inviter_user_id.eq.${user.id},invitee_user_id.eq.${user.id}`);

    if (linkError && !String(linkError.message ?? "").toLowerCase().includes("account_link_invites")) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    const linkedPropertyIds = new Set<string>();
    for (const row of (linkRows ?? []) as { assigned_property_ids?: unknown }[]) {
      if (!Array.isArray(row.assigned_property_ids)) continue;
      for (const id of row.assigned_property_ids) {
        if (typeof id === "string" && id.trim()) linkedPropertyIds.add(id.trim());
      }
    }

    const { data: ownedRows, error } = await baseQuery.eq("manager_user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = ownedRows ?? [];
    if (linkedPropertyIds.size > 0) {
      const { data: linkedRows, error: linkedError } = await db
        .from("manager_property_records")
        .select("id, manager_user_id, status, row_data, property_data, edit_request_note")
        .in("id", [...linkedPropertyIds])
        .order("updated_at", { ascending: false });

      if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 });

      const seen = new Set(rows.map((row) => row.id));
      rows = [...rows, ...((linkedRows ?? []).filter((row) => !seen.has(row.id)))];
    }

    return NextResponse.json({ snapshot: propertyRowsToSnapshot(rows) });
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
