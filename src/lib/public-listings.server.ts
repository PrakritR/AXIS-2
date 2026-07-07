import "server-only";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads } from "@/lib/demo-property-pipeline";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

function asProperty(value: unknown, id: string): MockProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = value as MockProperty;
  return { ...property, id: property.id?.trim() || id };
}

/**
 * Public catalog of admin-approved live manager listings — the single source of
 * truth backing both `/api/property-records/public` (browser fetch) and the AI
 * housing-search tool (server-side, no HTTP round-trip). Keep both callers on
 * this function so "what the search sees" never drifts from "what the AI sees".
 */
export async function getPublicListings(): Promise<MockProperty[]> {
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db
    .from("manager_property_records")
    .select("id, property_data")
    .eq("status", "live")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

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

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}
