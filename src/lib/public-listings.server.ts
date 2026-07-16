import "server-only";
import type { MockProperty } from "@/data/types";
import { managerContactSmsPhoneForPublicCta, isClawSharedLineBridgeEnabled } from "@/lib/claw-leasing-links";
import { isPropertyActiveForLeads } from "@/lib/demo-property-pipeline";
import { filterSandboxFromPublicCatalog } from "@/lib/public-sandbox-listings";
import { isProductionRuntime } from "@/lib/server-env";
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
    .select("id, manager_user_id, property_data")
    .eq("status", "live")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const production = isProductionRuntime();
  const managerIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.manager_user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const managerEmailByUserId = new Map<string, string | null>();
  const managerSmsByUserId = new Map<string, string | null>();
  if (managerIds.length > 0) {
    const { data: profiles, error: profileError } = await db
      .from("profiles")
      .select("id, email, sms_from_number")
      .in("id", managerIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) {
      managerEmailByUserId.set(profile.id, profile.email ?? null);
      const sms = managerContactSmsPhoneForPublicCta(String(profile.sms_from_number ?? "").trim() || null);
      managerSmsByUserId.set(profile.id, sms);
    }
  }

  const byKey = new Map<string, MockProperty>();
  for (const row of data ?? []) {
    const property = asProperty(row.property_data, row.id);
    if (!property) continue;
    // `status = live` is the source of truth in Supabase; older rows may omit the flag in JSON.
    const live = property.adminPublishLive === true ? property : { ...property, adminPublishLive: true as const };
    if (!isPropertyActiveForLeads(live)) continue;
    const contactSmsPhone =
      (isClawSharedLineBridgeEnabled()
        ? managerContactSmsPhoneForPublicCta(null)
        : null) ||
      (row.manager_user_id ? managerSmsByUserId.get(row.manager_user_id) : null) ||
      managerContactSmsPhoneForPublicCta(live.contactSmsPhone) ||
      undefined;
    const withOwner = {
      ...live,
      ...(row.manager_user_id && !live.managerUserId ? { managerUserId: row.manager_user_id } : {}),
      ...(contactSmsPhone ? { contactSmsPhone } : {}),
    };
    const dedupeKey = `${withOwner.buildingName}::${withOwner.address}`.trim().toLowerCase();
    byKey.set(dedupeKey, withOwner);
  }

  const listings = [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  return filterSandboxFromPublicCatalog(listings, { production, managerEmailByUserId });
}
