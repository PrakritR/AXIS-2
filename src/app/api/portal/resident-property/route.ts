import { NextResponse } from "next/server";
import type { MockProperty } from "@/data/types";
import {
  normalizeManagerListingSubmissionV1,
  type ManagerListingServiceOption,
} from "@/lib/manager-listing-submission";
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

function propertyIdFromAppRow(row: {
  property_id?: string | null;
  assigned_property_id?: string | null;
  row_data?: unknown;
}): string {
  const fromCols =
    String(row.assigned_property_id ?? "").trim() || String(row.property_id ?? "").trim();
  if (fromCols) return fromCols;
  const rd =
    row.row_data && typeof row.row_data === "object" && !Array.isArray(row.row_data)
      ? (row.row_data as Record<string, unknown>)
      : {};
  return (
    String(rd.assignedPropertyId ?? "").trim() ||
    String(rd.propertyId ?? "").trim() ||
    String((rd.application as { propertyId?: string } | undefined)?.propertyId ?? "").trim()
  );
}

function serviceOffersFromProperty(property: MockProperty): ManagerListingServiceOption[] {
  if (!property.listingSubmission || property.listingSubmission.v !== 1) return [];
  return normalizeManagerListingSubmissionV1(property.listingSubmission).serviceRequestOptions ?? [];
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

    const rows = appRows ?? [];
    const approvedRow = rows.find((row) => applicationBucket(row.row_data) === "approved");
    const withProperty =
      approvedRow ??
      rows.find((row) => Boolean(propertyIdFromAppRow(row))) ??
      null;
    if (!withProperty) {
      return NextResponse.json({ error: "No property linked to this resident." }, { status: 404 });
    }
    const propertyId = propertyIdFromAppRow(withProperty);
    if (!propertyId) {
      return NextResponse.json({ error: "No property linked to this resident." }, { status: 404 });
    }

    const { data: propRecord, error: propError } = await db
      .from("manager_property_records")
      .select("id, property_data")
      .eq("id", propertyId)
      .maybeSingle();
    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 });

    let property = propRecord ? asProperty(propRecord.property_data, propRecord.id) : null;

    // Pending/draft listings sometimes live under a different id — soft-match by scanning
    // this manager's properties when the exact id miss fires (id formatting drift).
    if (!property) {
      const managerUserId = String(
        (withProperty.row_data as { managerUserId?: string } | null)?.managerUserId ?? "",
      ).trim();
      if (managerUserId) {
        const { data: managerProps } = await db
          .from("manager_property_records")
          .select("id, property_data")
          .eq("manager_user_id", managerUserId)
          .limit(100);
        const token = propertyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80).toLowerCase();
        const match = (managerProps ?? []).find((row) => {
          const id = String(row.id ?? "").trim();
          if (id === propertyId) return true;
          if (!token) return false;
          return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80).toLowerCase() === token;
        });
        if (match) property = asProperty(match.property_data, match.id);
      }
    }

    if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const serviceRequestOptions = serviceOffersFromProperty(property);

    return NextResponse.json(
      { property, serviceRequestOptions },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load property." },
      { status: 500 },
    );
  }
}
