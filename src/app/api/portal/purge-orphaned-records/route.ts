import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function canManage(role: string, isAdmin: boolean) {
  return isAdmin || role === "manager" || role === "owner";
}

export async function POST() {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const [{ data: profile }, admin] = await Promise.all([
      db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      isAdminUser(user.id),
    ]);
    const role = String(profile?.role ?? "").toLowerCase();
    if (!canManage(role, admin)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Collect all known resident emails for this manager (any application status)
    const { data: applications } = await db
      .from("manager_application_records")
      .select("resident_email")
      .eq("manager_user_id", user.id);

    const activeEmails = new Set(
      (applications ?? [])
        .map((r) => (typeof r.resident_email === "string" ? r.resident_email.trim().toLowerCase() : ""))
        .filter(Boolean),
    );

    // Safety guard: never delete when there are no known residents at all
    if (activeEmails.size === 0) {
      return NextResponse.json({ ok: true, deleted: {} });
    }

    const deleted: Record<string, number> = {};

    // Tables keyed by manager_user_id with resident_email
    const managerTables = [
      { table: "portal_household_charge_records", emailCol: "resident_email" },
      { table: "portal_recurring_rent_profile_records", emailCol: "resident_email" },
      { table: "portal_lease_pipeline_records", emailCol: "resident_email" },
      { table: "portal_work_order_records", emailCol: "resident_email" },
    ] as const;

    for (const { table, emailCol } of managerTables) {
      const { data: records } = await db
        .from(table)
        .select(`id, ${emailCol}`)
        .eq("manager_user_id", user.id);

      const orphanIds = (records ?? [])
        .filter((r) => {
          const email = typeof r[emailCol] === "string" ? r[emailCol].trim().toLowerCase() : "";
          return email && !activeEmails.has(email);
        })
        .map((r) => r.id as string)
        .filter(Boolean);

      if (orphanIds.length > 0) {
        await db.from(table).delete().in("id", orphanIds);
      }
      deleted[table] = orphanIds.length;
    }

    // Inbox threads: owner is manager, participant is resident
    const { data: inboxRecords } = await db
      .from("portal_inbox_thread_records")
      .select("id, participant_email")
      .eq("owner_user_id", user.id);

    const orphanInboxIds = (inboxRecords ?? [])
      .filter((r) => {
        const email = typeof r.participant_email === "string" ? r.participant_email.trim().toLowerCase() : "";
        return email && !activeEmails.has(email);
      })
      .map((r) => r.id as string)
      .filter(Boolean);

    if (orphanInboxIds.length > 0) {
      await db.from("portal_inbox_thread_records").delete().in("id", orphanInboxIds);
    }
    deleted["portal_inbox_thread_records"] = orphanInboxIds.length;

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to purge orphaned records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
