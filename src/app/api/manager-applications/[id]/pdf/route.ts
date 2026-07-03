import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { collectLinkedPropertyIdsForUser } from "@/lib/auth/manager-lease-scope";
import { applicationPdfFilename, buildApplicationPdf } from "@/lib/manager-application-pdf";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function idVariants(id: string): string[] {
  const trimmed = id.trim();
  const normalized = normalizeApplicationAxisId(trimmed);
  return [...new Set([trimmed, normalized].filter(Boolean))];
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const id = (rawId ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const ids = idVariants(id);
    const { data: records, error } = await db
      .from("manager_application_records")
      .select("id, row_data, manager_user_id, resident_email, property_id, assigned_property_id")
      .or(ids.map((value) => `id.eq.${value}`).join(","))
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const record = records?.[0];
    if (!record?.row_data) return NextResponse.json({ error: "Application not found." }, { status: 404 });

    // Authorize against the same scoping the applications list uses.
    const admin = await isAdminUser(user.id);
    let allowed = admin;
    if (!allowed) {
      const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
      const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
      const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
      if (role === "resident") {
        const recordEmail = String(record.resident_email ?? "").trim().toLowerCase();
        allowed = Boolean(email) && recordEmail === email;
      } else {
        if (record.manager_user_id && record.manager_user_id === user.id) {
          allowed = true;
        } else {
          const linked = await collectLinkedPropertyIdsForUser(db, user.id);
          const propertyId = String(record.property_id ?? "").trim();
          const assignedPropertyId = String(record.assigned_property_id ?? "").trim();
          allowed = Boolean(
            (propertyId && linked.has(propertyId)) || (assignedPropertyId && linked.has(assignedPropertyId)),
          );
        }
      }
    }
    if (!allowed) return NextResponse.json({ error: "Not authorized for this application." }, { status: 403 });

    const row = record.row_data as DemoApplicantRow;
    const url = new URL(req.url);
    const roomLabel = url.searchParams.get("roomLabel")?.trim() || undefined;
    // Inline disposition lets the manager UI embed the PDF in a preview frame instead of downloading it.
    const inline = url.searchParams.get("disposition") === "inline";

    const pdf = await buildApplicationPdf(row, { roomLabel });
    const filename = applicationPdfFilename(row);

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build application PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
