#!/usr/bin/env npx tsx
/**
 * Seeds default flyer + listing blurb promotions for every live property owned by
 * the canonical test manager. Invoked from tests/helpers/seed-test-db.mjs.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_MANAGER_USER_ID,
 *      SEED_MANAGER_EMAIL (optional, for contact autofill)
 */
import { createClient } from "@supabase/supabase-js";
import type { MockProperty } from "@/data/types";
import { ensureDefaultPromotionAssets } from "@/lib/promotion-default-sync";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const managerUserId = process.env.SEED_MANAGER_USER_ID?.trim();
const managerEmail = process.env.SEED_MANAGER_EMAIL?.trim().toLowerCase() || "manager@test.proplane.local";
const appOrigin = process.env.SEED_APP_ORIGIN?.trim() || "https://prop-lane.space";

if (!url || !serviceKey || !managerUserId) {
  console.error("seed-manager-promotion-defaults: missing Supabase env or SEED_MANAGER_USER_ID");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function must<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
  label: string,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as T;
}

function propertyFromRow(row: {
  id: string;
  property_data: Record<string, unknown> | null;
}): MockProperty | null {
  const data = row.property_data;
  if (!data || typeof data !== "object") return null;
  return { ...(data as MockProperty), id: row.id };
}

async function main() {
  const { data: propertyRows, error } = await db
    .from("manager_property_records")
    .select("id, property_data, status")
    .eq("manager_user_id", managerUserId)
    .eq("status", "live");
  if (error) throw new Error(`manager_property_records: ${error.message}`);

  const { data: existingPromotionRows, error: promoErr } = await db
    .from("manager_promotion_records")
    .select("id, row_data")
    .eq("manager_user_id", managerUserId);
  if (promoErr) throw new Error(`manager_promotion_records: ${promoErr.message}`);

  const promotionByProperty = new Map<string, ManagerPromotionRow>();
  for (const row of existingPromotionRows ?? []) {
    const data = row.row_data as ManagerPromotionRow | null;
    const propertyId = data?.propertyId?.trim();
    if (propertyId) promotionByProperty.set(propertyId, data!);
  }

  let seeded = 0;
  for (const row of propertyRows ?? []) {
    const property = propertyFromRow(row);
    if (!property) continue;
    const existingRow = promotionByProperty.get(property.id) ?? null;
    const next = ensureDefaultPromotionAssets({
      propertyId: property.id,
      property,
      managerUserId,
      managerContact: managerEmail,
      appOrigin,
      existingRow,
    });
    if (!next) continue;
    await must(
      db.from("manager_promotion_records").upsert(
        {
          id: next.id,
          manager_user_id: managerUserId,
          row_data: next,
          updated_at: next.updatedAt,
        },
        { onConflict: "id" },
      ),
      `manager_promotion_records(${property.id})`,
    );
    promotionByProperty.set(property.id, next);
    seeded += 1;
  }

  console.log(JSON.stringify({ ok: true, promotionPropertiesSeeded: seeded, totalLive: propertyRows?.length ?? 0 }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
