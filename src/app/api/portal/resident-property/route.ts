import { NextResponse } from "next/server";
import type { MockProperty } from "@/data/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function asProperty(value: unknown, id: string): MockProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = value as MockProperty;
  return { ...property, id: property.id?.trim() || id };
}

function applicationBucket(rowData: unknown): string {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return "";
  return String((rowData as { bucket?: string }).bucket ?? "").toLowerCase();
}

/**
 * Resident-scoped property lookup, regardless of publish status — unlike the
 * public catalog/lead routes (live-only), a resident must see their own
 * property's data (e.g. manager-offered service request types) even while it
 * is "review" or "unlisted". Scoped server-side to the resident's own linked
 * application row, never a client-supplied ownership claim.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "No email on file." }, { status: 400 });

    const { data: appRows, error: appError } = await db
      .from("manager_application_records")
      .select("property_id, assigned_property_id, row_data, updated_at")
      .eq("resident_email", email)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (appError) return NextResponse.json({ error: appError.message }, { status: 500 });

    const approvedRow =
      (appRows ?? []).find((row) => applicationBucket(row.row_data) === "approved") ?? appRows?.[0];
    const propertyId = approvedRow?.assigned_property_id?.trim() || approvedRow?.property_id?.trim() || "";
    if (!propertyId) return NextResponse.json({ error: "No property linked to this resident." }, { status: 404 });

    const { data: propRecord, error: propError } = await db
      .from("manager_property_records")
      .select("id, property_data")
      .eq("id", propertyId)
      .maybeSingle();
    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 });

    const property = propRecord ? asProperty(propRecord.property_data, propRecord.id) : null;
    if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    return NextResponse.json({ property }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load property." },
      { status: 500 },
    );
  }
}
