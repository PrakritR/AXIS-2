#!/usr/bin/env node
/**
 * Restore 5259 Brooklyn Ave NE (if missing) and set per-room move-in instructions.
 *
 * Dev/test only — refuses the production Supabase project unless
 * ALLOW_PRODUCTION_LISTING_WRITE=1 (captain-approved).
 *
 * Usage:
 *   node --env-file=.env.local scripts/restore-brooklyn-move-in.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refuseProductionListingWrites } from "./lib/refuse-production-listing-writes.mjs";
import {
  BROOKLYN_PROPERTY_ID,
  applyBrooklynMoveInInstructions,
} from "./brooklyn-move-in-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
refuseProductionListingWrites(url, "restore-brooklyn-move-in.mjs");

function loadRestorePropertyData() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20260730124500_restore_5259_brooklyn_production.sql"),
    "utf8",
  );
  return JSON.parse(sql.match(/'(\{.*\})'/s)[1]);
}

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

async function resolveManagerUserId() {
  const existing = await api(
    `/rest/v1/manager_property_records?id=eq.${BROOKLYN_PROPERTY_ID}&select=manager_user_id`,
  );
  if (existing?.[0]?.manager_user_id) return existing[0].manager_user_id;

  const ambikaId = "c49d02b1-7e99-4484-9986-b3b4550c3519";
  const ambika = await api(`/rest/v1/profiles?id=eq.${ambikaId}&select=id`);
  if (ambika?.[0]?.id) return ambikaId;

  const fallback = await api(
    "/rest/v1/profiles?select=id&email=eq.manager@test.proplane.local&limit=1",
  );
  if (fallback?.[0]?.id) return fallback[0].id;

  throw new Error("No manager user found to own Brooklyn listing");
}

async function main() {
  const ref = new URL(url).hostname.split(".")[0];
  const managerUserId = await resolveManagerUserId();
  const propertyData = applyBrooklynMoveInInstructions(loadRestorePropertyData());
  propertyData.managerUserId = managerUserId;

  const body = {
    id: BROOKLYN_PROPERTY_ID,
    manager_user_id: managerUserId,
    status: "live",
    property_data: propertyData,
    updated_at: new Date().toISOString(),
  };

  const rows = await api("/rest/v1/manager_property_records", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });

  const room4 = rows[0].property_data.listingSubmission.rooms.find(
    (r) => r.id === "seed-5259-brooklyn-room-4",
  );
  console.log(`[${ref}] Restored/updated ${BROOKLYN_PROPERTY_ID} for manager ${managerUserId}`);
  console.log(`[${ref}] Room 4 move-in set (${room4.moveInInstructions.length} chars)`);
  console.log(`[${ref}] generalHouseInfo preview:\n${rows[0].property_data.listingSubmission.generalHouseInfo}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
