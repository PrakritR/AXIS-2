import { NextResponse } from "next/server";
import type { MockProperty } from "@/data/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db
      .from("manager_property_records")
      .select("property_data")
      .eq("status", "live")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byPropertyKey = new Map<string, MockProperty>();
    for (const row of data ?? []) {
      const property = row.property_data as MockProperty | null;
      if (!property?.id) continue;
      const key = `${property.buildingName}::${property.address}`.trim().toLowerCase();
      byPropertyKey.set(key, property);
    }

    return NextResponse.json({ listings: [...byPropertyKey.values()] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load listings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
