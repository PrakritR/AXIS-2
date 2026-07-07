/**
 * Proxy the official Checkr Tenant PDF report for a manager-owned application.
 * The Checkr API key stays server-side; the browser receives PDF bytes only.
 */
import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { collectLinkedPropertyIdsForUser } from "@/lib/auth/manager-lease-scope";
import { checkrApiFetch } from "@/lib/checkr/client";
import { backgroundCheckConfigured, checkrSkipsManagerCardCharge } from "@/lib/checkr/config";
import { fetchCheckrReportPdfBytes } from "@/lib/checkr/report-document";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function loadApplicationRow(applicationId: string): Promise<DemoApplicantRow | null> {
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_application_records")
    .select("row_data")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data?.row_data) return null;
  return data.row_data as DemoApplicantRow;
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const url = new URL(req.url);
    const applicationId = url.searchParams.get("applicationId")?.trim();
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

    if (!backgroundCheckConfigured()) {
      return NextResponse.json({ error: "Background checks are not configured." }, { status: 503 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: record } = await db
      .from("manager_application_records")
      .select("manager_user_id, property_id, assigned_property_id, row_data")
      .eq("id", applicationId)
      .maybeSingle();

    const row = (record?.row_data as DemoApplicantRow | null) ?? (await loadApplicationRow(applicationId));
    if (!row) return NextResponse.json({ error: "Application not found." }, { status: 404 });

    const managerUserId =
      record?.manager_user_id?.trim() || row.managerUserId?.trim() || "";
    if (!managerUserId) {
      return NextResponse.json({ error: "Application has no assigned manager." }, { status: 400 });
    }

    const admin = await isAdminUser(user.id);
    if (!admin && managerUserId !== user.id) {
      const linked = await collectLinkedPropertyIdsForUser(db, user.id);
      const propertyId = String(record?.property_id ?? row.propertyId ?? "").trim();
      const assignedPropertyId = String(record?.assigned_property_id ?? row.assignedPropertyId ?? "").trim();
      if (!((propertyId && linked.has(propertyId)) || (assignedPropertyId && linked.has(assignedPropertyId)))) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const bc = row.backgroundCheck;
    if (!bc || bc.status !== "complete") {
      return NextResponse.json({ error: "Report is not ready yet." }, { status: 404 });
    }

    if (bc.simulated && checkrSkipsManagerCardCharge()) {
      return NextResponse.json({ error: "Official PDF is unavailable in offline demo mode." }, { status: 404 });
    }

    const pdf = await fetchCheckrReportPdfBytes(checkrApiFetch, {
      orderId: bc.reportId,
      reportResourceId: bc.reportResourceId,
    });
    if (!pdf) {
      return NextResponse.json({ error: "Could not retrieve the Checkr report PDF." }, { status: 502 });
    }

    const filename = `checkr-report-${applicationId}.pdf`;
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load report document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
