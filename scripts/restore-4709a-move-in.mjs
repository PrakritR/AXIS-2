#!/usr/bin/env node
/**
 * Update 4709A 8th Ave NE move-in instructions (front door + per-room locker combos).
 *
 * Dev/test only — refuses the production Supabase project unless
 * ALLOW_PRODUCTION_LISTING_WRITE=1 (captain-approved).
 *
 * Usage:
 *   node --env-file=.env.local scripts/restore-4709a-move-in.mjs
 */
import { refuseProductionListingWrites } from "./lib/refuse-production-listing-writes.mjs";
import {
  A4709A_PROPERTY_ID,
  apply4709aMoveInInstructions,
} from "./4709a-move-in-data.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
refuseProductionListingWrites(url, "restore-4709a-move-in.mjs");

async function api(pathname, options = {}) {
  const res = await fetch(`${url}${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${typeof data === "object" ? JSON.stringify(data) : data}`);
  }
  return data;
}

async function main() {
  const ref = new URL(url).hostname.split(".")[0];
  const existing = await api(
    `/rest/v1/manager_property_records?id=eq.${A4709A_PROPERTY_ID}&select=property_data,manager_user_id`,
  );
  if (!existing?.[0]) {
    throw new Error(`${A4709A_PROPERTY_ID} not found`);
  }

  const managerUserId = existing[0].manager_user_id;
  const propertyData = apply4709aMoveInInstructions(structuredClone(existing[0].property_data));

  const rows = await api("/rest/v1/manager_property_records", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: A4709A_PROPERTY_ID,
      manager_user_id: managerUserId,
      status: "live",
      property_data: propertyData,
      updated_at: new Date().toISOString(),
    }),
  });

  const room1 = rows[0].property_data.listingSubmission.rooms.find((r) => r.id === "seed-4709a-room-1");
  console.log(`[${ref}] Updated ${A4709A_PROPERTY_ID}`);
  console.log(`[${ref}] Room 1 move-in (${room1.moveInInstructions.length} chars)`);
  console.log(`[${ref}] generalHouseInfo preview:\n${rows[0].property_data.listingSubmission.generalHouseInfo.slice(0, 200)}…`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
