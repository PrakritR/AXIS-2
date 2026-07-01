import { NextResponse } from "next/server";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads } from "@/lib/demo-property-pipeline";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function asProperty(value: unknown): MockProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MockProperty;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId")?.trim() ?? "";
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("manager_property_records")
      .select("id, status, property_data")
      .eq("id", propertyId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.status !== "live") {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    const property = asProperty(data.property_data);
    if (!property || !isPropertyActiveForLeads(property)) {
      return NextResponse.json({ error: "Property is not active for apply or tour links." }, { status: 404 });
    }

    // Public per-property detail: CDN-cacheable, same for everyone.
    return NextResponse.json(
      { property: { ...property, id: property.id || propertyId } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load property." },
      { status: 500 },
    );
  }
}
