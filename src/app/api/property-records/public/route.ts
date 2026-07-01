import { NextResponse } from "next/server";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads } from "@/lib/demo-property-pipeline";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function asProperty(value: unknown, id: string): MockProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = value as MockProperty;
  return { ...property, id: property.id?.trim() || id };
}

/** Public catalog of admin-approved live manager listings (apply / browse). */
export async function GET() {
  try {
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("manager_property_records")
      .select("id, property_data")
      .eq("status", "live")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byKey = new Map<string, MockProperty>();
    for (const row of data ?? []) {
      const property = asProperty(row.property_data, row.id);
      if (!property) continue;
      // `status = live` is the source of truth in Supabase; older rows may omit the flag in JSON.
      const live = property.adminPublishLive === true ? property : { ...property, adminPublishLive: true as const };
      if (!isPropertyActiveForLeads(live)) continue;
      const dedupeKey = `${live.buildingName}::${live.address}`.trim().toLowerCase();
      byKey.set(dedupeKey, live);
    }

    const listings = [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
    // Public catalog, same for everyone: let the CDN serve repeats without
    // re-querying Supabase. s-maxage bounds staleness after a manager publishes.
    return NextResponse.json(
      { listings },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load public listings." },
      { status: 500 },
    );
  }
}
