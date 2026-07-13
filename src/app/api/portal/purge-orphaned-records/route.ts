import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { purgeOrphanedPortalRecords } from "@/lib/auth/purge-orphaned-portal-records";
import { hasMoveOutDatePassed, isPreviousResidentStage } from "@/lib/current-resident";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function canManage(role: string, isAdmin: boolean) {
  return isAdmin || role === "manager";
}

function isCurrentResidentRow(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const record = row as {
    bucket?: unknown;
    stage?: unknown;
    manualResidentDetails?: { moveOutDate?: unknown } | null;
  };
  const bucket = typeof record.bucket === "string" ? record.bucket.trim().toLowerCase() : "";
  if (bucket !== "approved") return false;
  const moveOutRaw =
    record.manualResidentDetails && typeof record.manualResidentDetails === "object"
      ? record.manualResidentDetails.moveOutDate
      : undefined;
  const moveOut = typeof moveOutRaw === "string" ? moveOutRaw : undefined;
  if (hasMoveOutDatePassed(moveOut)) return false;
  const stage = typeof record.stage === "string" ? record.stage : undefined;
  return !isPreviousResidentStage(stage);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { mode?: unknown } | null;
    const mode = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "current_only";
    const currentOnly = mode === "current_only";

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

    if (mode === "admin_global") {
      if (!admin) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const result = await purgeOrphanedPortalRecords(db);
      return NextResponse.json({ ok: true, ...result });
    }

    // Collect all known resident emails for this manager.
    const { data: applications } = await db
      .from("manager_application_records")
      .select("id, resident_email, row_data")
      .eq("manager_user_id", user.id);

    const activeEmails = new Set<string>();
    const deletedApplicationIds: string[] = [];
    const orphanedEmails = new Set<string>();
    for (const record of applications ?? []) {
      const email = typeof record.resident_email === "string" ? record.resident_email.trim().toLowerCase() : "";
      if (currentOnly) {
        const rowBucket = (record.row_data as { bucket?: unknown } | null)?.bucket;
        const stillUnderReview = typeof rowBucket === "string" && rowBucket.trim().toLowerCase() !== "approved";
        if (stillUnderReview) {
          // Pending/rejected applications are open review items, not deleted residents —
          // never sweep them up here, or every pending application (including ones added
          // from the Residents tab) would be wiped the moment this cleanup next runs.
          if (email) activeEmails.add(email);
          continue;
        }
        const keep = email && isCurrentResidentRow(record.row_data);
        if (keep) {
          activeEmails.add(email);
        } else {
          if (email) orphanedEmails.add(email);
          if (record.id) deletedApplicationIds.push(record.id);
        }
      } else if (email) {
        activeEmails.add(email);
      }
    }

    // Safety guard: never delete when there are no known residents at all
    if (activeEmails.size === 0) {
      return NextResponse.json({
        ok: true,
        deleted: {},
        purgedEmails: [...orphanedEmails],
        deletedApplicationIds,
      });
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
        .map((r) => {
          const email = typeof r[emailCol] === "string" ? r[emailCol].trim().toLowerCase() : "";
          if (email) orphanedEmails.add(email);
          return r.id as string;
        })
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
      .map((r) => {
        const email = typeof r.participant_email === "string" ? r.participant_email.trim().toLowerCase() : "";
        if (email) orphanedEmails.add(email);
        return r.id as string;
      })
      .filter(Boolean);

    if (orphanInboxIds.length > 0) {
      await db.from("portal_inbox_thread_records").delete().in("id", orphanInboxIds);
    }
    deleted["portal_inbox_thread_records"] = orphanInboxIds.length;

    if (currentOnly && deletedApplicationIds.length > 0) {
      await db.from("manager_application_records").delete().in("id", deletedApplicationIds);
    }
    deleted["manager_application_records"] = currentOnly ? deletedApplicationIds.length : 0;

    return NextResponse.json({
      ok: true,
      deleted,
      purgedEmails: [...orphanedEmails],
      deletedApplicationIds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to purge orphaned records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
