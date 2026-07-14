import { clearHousingAccessForDeletedProperty } from "@/lib/auth/clear-property-housing-access";
import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { assertCoManagerModuleAccess } from "@/lib/auth/co-manager-access";
import { asStringArray } from "@/app/api/pro/account-links/route";
import { isCrossSandboxPortalPair } from "@/lib/portal-sandbox-accounts";
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
      // Admins get the full inventory; client must scope with its own linked ids.
      return NextResponse.json({ snapshot: propertyRowsToSnapshot(data ?? []), linkedPropertyIds: [] as string[] });
    }

    const { data: viewerProfile } = await db.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const viewerEmail = String(viewerProfile?.email ?? user.email ?? "").trim();

    const { data: linkRows, error: linkError } = await db
      .from("account_link_invites")
      .select("inviter_user_id, assigned_property_ids")
      .eq("status", "accepted")
      .eq("invitee_user_id", user.id);

    if (linkError && !String(linkError.message ?? "").toLowerCase().includes("account_link_invites")) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    const inviterIds = [
      ...new Set(
        (linkRows ?? [])
          .map((row) => String((row as { inviter_user_id?: string }).inviter_user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const inviterEmailById = new Map<string, string>();
    if (inviterIds.length > 0) {
      const { data: inviterProfiles } = await db.from("profiles").select("id, email").in("id", inviterIds);
      for (const profile of inviterProfiles ?? []) {
        const id = String(profile.id ?? "").trim();
        const email = String(profile.email ?? "").trim();
        if (id && email) inviterEmailById.set(id, email);
      }
    }

    const linkedPropertyIds = new Set<string>();
    for (const row of linkRows ?? []) {
      const inviterId = String((row as { inviter_user_id?: string }).inviter_user_id ?? "").trim();
      const inviterEmail = inviterEmailById.get(inviterId) ?? "";
      if (isCrossSandboxPortalPair(viewerEmail, inviterEmail)) continue;
      for (const id of asStringArray((row as { assigned_property_ids?: unknown }).assigned_property_ids)) {
        if (id.trim()) linkedPropertyIds.add(id.trim());
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

    // Return authoritative linked ids from the same invite query so the client
    // does not re-scope with a stale/empty local relationship cache (which used
    // to drop co-managed listings like Brooklyn from the local pipeline).
    return NextResponse.json({
      snapshot: propertyRowsToSnapshot(rows),
      linkedPropertyIds: [...linkedPropertyIds],
    });
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
    const db = createSupabaseServiceRoleClient();

    // Look up the stored row's owner ONCE. All authorization anchors on this
    // server-read value, never on body.managerUserId (which a caller controls).
    const { data: existing } = await db
      .from("manager_property_records")
      .select("manager_user_id")
      .eq("id", id)
      .maybeSingle();
    const existingOwnerId = existing ? String(existing.manager_user_id ?? "").trim() : "";
    const isDelete = body.action === "delete";

    // Resolve who the write is attributed to, and authorize the caller.
    let ownerForWrite: string;
    if (admin) {
      ownerForWrite = body.managerUserId?.trim() || existingOwnerId || user.id;
    } else if (!existing) {
      // Creating a brand-new record — only ever under yourself. A co-manager
      // cannot create a property owned by someone else.
      ownerForWrite = body.managerUserId?.trim() || user.id;
      if (ownerForWrite !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    } else if (existingOwnerId === user.id) {
      ownerForWrite = user.id; // owner editing / deleting their own listing
    } else {
      // Co-manager acting on a linked owner's listing: require the `properties`
      // module at edit (write) or delete level on THIS property. The owner is
      // preserved on write so a co-manager can never reassign ownership.
      const access = await assertCoManagerModuleAccess(db, user.id, id, "properties", {
        ownerManagerUserId: existingOwnerId,
        level: isDelete ? "delete" : "edit",
      });
      if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
      ownerForWrite = existingOwnerId;
    }

    if (isDelete) {
      const { error } = await db.from("manager_property_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      try {
        await clearHousingAccessForDeletedProperty(db, id);
      } catch (cleanupErr) {
        const message = cleanupErr instanceof Error ? cleanupErr.message : "Housing cleanup failed.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
      track("property_deleted", user.id, { property_id: id });
      return NextResponse.json({ ok: true });
    }

    if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 });

    const { error } = await db.from("manager_property_records").upsert(
      {
        id,
        manager_user_id: ownerForWrite,
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
