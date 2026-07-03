/**
 * Run / refresh a Checkr criminal background check for an applicant.
 *
 * Security: the Checkr key stays server-side (in the lib client). The manager
 * is authenticated from the session cookie and may only act on applications
 * they own, are linked to by property, or an admin. `managerUserId` is derived
 * from the record, never from model/client input.
 */
import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { collectLinkedPropertyIdsForUser } from "@/lib/auth/manager-lease-scope";
import { track } from "@/lib/analytics/posthog";
import { runBackgroundCheck, refreshBackgroundCheck } from "@/lib/checkr/background-check";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { applicationId?: string; action?: "run" | "refresh" };

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as Body;
    const applicationId = body.applicationId?.trim();
    const action = body.action === "refresh" ? "refresh" : "run";
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: record } = await db
      .from("manager_application_records")
      .select("manager_user_id, property_id, assigned_property_id, row_data")
      .eq("id", applicationId)
      .maybeSingle();

    const managerUserId =
      record?.manager_user_id?.trim() ||
      (record?.row_data as { managerUserId?: string } | null)?.managerUserId?.trim();
    if (!managerUserId) {
      return NextResponse.json({ error: "Application has no assigned manager." }, { status: 400 });
    }
    if (!admin && managerUserId !== user.id) {
      const linked = await collectLinkedPropertyIdsForUser(db, user.id);
      const rowData = (record?.row_data ?? {}) as {
        propertyId?: string;
        assignedPropertyId?: string;
        application?: { propertyId?: string };
      };
      const propertyId = String(record?.property_id ?? rowData.propertyId ?? rowData.application?.propertyId ?? "").trim();
      const assignedPropertyId = String(record?.assigned_property_id ?? rowData.assignedPropertyId ?? "").trim();
      if (!((propertyId && linked.has(propertyId)) || (assignedPropertyId && linked.has(assignedPropertyId)))) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const result =
      action === "refresh"
        ? await refreshBackgroundCheck({ db, applicationId, managerUserId })
        : await runBackgroundCheck({ db, applicationId, managerUserId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }

    // Server-confirmed analytics — ids/enums only, no PII.
    const bc = result.backgroundCheck;
    if (action === "run") {
      track("background_check_started", managerUserId, { provider: bc.provider });
    }
    if (bc.status === "complete" && bc.result) {
      track("background_check_completed", managerUserId, { provider: bc.provider, result: bc.result });
    }

    return NextResponse.json({ ok: true, backgroundCheck: bc, row: result.row });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run background check.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
