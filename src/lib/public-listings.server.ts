import "server-only";
import type { MockProperty } from "@/data/types";
import { isPropertyActiveForLeads } from "@/lib/demo-property-pipeline";
import {
  resolveListingCtaSmsPhone,
  type ListingCtaManagerProfile,
} from "@/lib/listing-cta-phone.server";
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
  const managerProfileByUserId = new Map<string, ListingCtaManagerProfile>();
  if (managerIds.length > 0) {
    const { data: profiles, error: profileError } = await db
      .from("profiles")
      .select("id, email, phone, phone_verified_at, sms_from_number")
      .in("id", managerIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) {
      managerEmailByUserId.set(profile.id, profile.email ?? null);
      managerProfileByUserId.set(profile.id, {
        phone: profile.phone ?? null,
        phone_verified_at: profile.phone_verified_at ?? null,
        sms_from_number: profile.sms_from_number ?? null,
      });
    }
  }

  const byKey = new Map<string, MockProperty>();
  for (const row of data ?? []) {
    const property = asProperty(row.property_data, row.id);
    if (!property) continue;
    // `status = live` is the source of truth in Supabase; older rows may omit the flag in JSON.
    const live = property.adminPublishLive === true ? property : { ...property, adminPublishLive: true as const };
    if (!isPropertyActiveForLeads(live)) continue;
    // Resolved from THIS row's owning manager, never a catalog-wide default, so
    // a multi-manager fleet cannot cross-route a prospect to the wrong phone.
    // Deliberately ignores any `contactSmsPhone` baked into the stored property
    // JSON — that blob is manager-editable and could point anywhere.
    const contactSmsPhone =
      resolveListingCtaSmsPhone(
        row.manager_user_id ? managerProfileByUserId.get(row.manager_user_id) ?? null : null,
      ) ?? undefined;
    const withOwner: MockProperty = {
      ...live,
      ...(row.manager_user_id && !live.managerUserId ? { managerUserId: row.manager_user_id } : {}),
      // Always overwrite (never merely default) so an unresolved manager drops
      // the stored number rather than publishing a stale one.
      contactSmsPhone,
    };
    const dedupeKey = `${withOwner.buildingName}::${withOwner.address}`.trim().toLowerCase();
    byKey.set(dedupeKey, withOwner);
  }

  const listings = [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  return filterSandboxFromPublicCatalog(listings, { production, managerEmailByUserId });
}
