#!/usr/bin/env npx tsx
/**
 * Seed THREE example listings into the canonical demo manager (`manager@test.axis.local`)
 * so the demo portfolio exercises every rental model the Pricing step supports:
 *
 *   1. rent-by-bedroom (shared home) — each room has its OWN rent / deposit / utilities
 *   2. entire-home — one whole-place monthly rent
 *   3. group-bundle — rooms grouped onto one lease at a bundle price
 *
 * ADDITIVE + IDEMPOTENT. It UPSERTs three fixed-id `manager_property_records`
 * (`example-rentbyroom`, `example-entirehome`, `example-bundle`) by `id`; it NEVER deletes,
 * truncates, or touches any other row. Re-running it just refreshes those three. Nothing
 * else in the account (or any other account) is affected. Mirrors the additive writer in
 * `src/lib/demo/canonical-demo-portfolio-db.ts` (upsert-only).
 *
 *   npx tsx scripts/seed-demo-example-listings.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env, then .env). Refuses to
 * run against the production Supabase project (hard, fail-closed guard). The manager auth
 * account must already exist. To remove the three listings later: delete the rows with
 * id in ('example-rentbyroom','example-entirehome','example-bundle').
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isProductionSupabaseProjectUrl } from "../tests/helpers/canonical-production-accounts.mjs";
import { CANONICAL_DEMO_MANAGER_EMAIL } from "@/lib/demo/demo-canonical-accounts";
import {
  createDefaultListingSubmission,
  emptyRoom,
  emptyBundleRow,
  type ManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import type { MockProperty } from "@/data/types";

// ---- env (process env first, .env fallback) --------------------------------
function loadDotEnvFallback() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}
loadDotEnvFallback();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env).");
  process.exit(1);
}

// Hard production guard, fail-closed (same as seed-dev-manager-portfolio.ts): the helper
// falls back to the hardcoded production ref when AXIS_PROD_SUPABASE_REF is unset.
const misspelledRef = process.env.AXIS_PROD_SUPABSE_REF?.trim();
if (
  isProductionSupabaseProjectUrl(url) ||
  (misspelledRef && new URL(url).hostname === `${misspelledRef}.supabase.co`)
) {
  console.error("Refusing to seed the production Supabase project.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ---- listing builders ------------------------------------------------------
function room(over: Partial<ManagerRoomSubmission>, i: number): ManagerRoomSubmission {
  return {
    ...emptyRoom(i),
    name: `Room ${i + 1}`,
    floor: "Main",
    availability: "Available now",
    moveInAvailableDate: "2026-01-01",
    utilitiesPaymentModel: "manager_billed",
    ...over,
  };
}

/** 1. Rent by bedroom — each room prices its own rent / deposit / utilities. */
function rentByRoomSubmission(): ManagerListingSubmissionV1 {
  const base = createDefaultListingSubmission();
  return {
    ...base,
    buildingName: "Maple Coliving",
    address: "1200 Example Ave, Seattle, WA 98101",
    zip: "98101",
    neighborhood: "Capitol Hill",
    listingPlaceCategoryId: "shared_home",
    rentalModelStamp: "shared_home",
    listingBedroomSlots: 3,
    allowedLeaseTerms: ["12-Month"],
    petFriendly: true,
    rooms: [
      room({ id: "ex-rbr-1", monthlyRent: 1100, securityDeposit: "1100", moveInFee: "150", utilitiesEstimate: "120" }, 0),
      room({ id: "ex-rbr-2", monthlyRent: 950, securityDeposit: "950", moveInFee: "150", utilitiesEstimate: "120" }, 1),
      room({ id: "ex-rbr-3", monthlyRent: 1250, securityDeposit: "1250", moveInFee: "150", utilitiesEstimate: "120" }, 2),
    ],
    applicationFee: "40",
  };
}

/** 2. Entire home — one whole-place monthly rent. */
function entireHomeSubmission(): ManagerListingSubmissionV1 {
  const base = createDefaultListingSubmission();
  return {
    ...base,
    buildingName: "Cedar House",
    address: "88 Example St, Seattle, WA 98104",
    zip: "98104",
    neighborhood: "Pioneer Square",
    listingPlaceCategoryId: "entire_home",
    rentalModelStamp: "entire_home",
    listingBedroomSlots: 2,
    allowedLeaseTerms: ["12-Month"],
    entireHomeMonthlyRent: 4200,
    entireHomeUtilitiesPaymentModel: "manager_billed",
    entireHomeUtilitiesEstimate: "220",
    securityDeposit: "4200",
    moveInFee: "300",
    applicationFee: "40",
    rooms: [room({ id: "ex-eh-1", monthlyRent: 0 }, 0), room({ id: "ex-eh-2", monthlyRent: 0 }, 1)],
  };
}

/** 3. Group bundle — rooms grouped onto one lease at a bundle price. */
function bundleSubmission(): ManagerListingSubmissionV1 {
  const base = createDefaultListingSubmission();
  const rooms = [
    room({ id: "ex-bnd-1", monthlyRent: 1000, securityDeposit: "1000", utilitiesEstimate: "100" }, 0),
    room({ id: "ex-bnd-2", monthlyRent: 1000, securityDeposit: "1000", utilitiesEstimate: "100" }, 1),
    room({ id: "ex-bnd-3", monthlyRent: 1100, securityDeposit: "1100", utilitiesEstimate: "100" }, 2),
  ];
  return {
    ...base,
    buildingName: "Birch Flats",
    address: "455 Example Blvd, Seattle, WA 98109",
    zip: "98109",
    neighborhood: "South Lake Union",
    listingPlaceCategoryId: "shared_home",
    rentalModelStamp: "shared_home",
    listingBedroomSlots: 3,
    allowedLeaseTerms: ["12-Month"],
    rooms,
    bundles: [
      {
        ...emptyBundleRow(),
        id: "ex-bnd-pkg",
        label: "Rooms 1 + 2 together",
        price: "1850",
        strikethrough: "2000",
        includedRoomIds: ["ex-bnd-1", "ex-bnd-2"],
        securityDeposit: "1850",
        moveInFee: "250",
        utilitiesPaymentModel: "manager_billed",
        utilitiesEstimate: "180",
      },
    ],
    applicationFee: "40",
  };
}

function mockProperty(id: string, managerUserId: string, sub: ManagerListingSubmissionV1, beds: number, rentLabel: string): MockProperty {
  return {
    id,
    title: sub.buildingName,
    tagline: "Example listing for the demo portfolio",
    address: sub.address,
    zip: sub.zip,
    neighborhood: sub.neighborhood,
    beds,
    baths: 1,
    rentLabel,
    available: "Now",
    petFriendly: sub.petFriendly,
    buildingId: id,
    buildingName: sub.buildingName,
    unitLabel: sub.buildingName,
    adminPublishLive: true,
    managerUserId,
    listingSubmission: sub,
  };
}

// ---- main ------------------------------------------------------------------
async function findManagerId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .select("id, role")
    .ilike("email", CANONICAL_DEMO_MANAGER_EMAIL)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup: ${error.message}`);
  if (!data) throw new Error(`No profile for ${CANONICAL_DEMO_MANAGER_EMAIL} — sign the account up first.`);
  if (data.role !== "manager") throw new Error(`${CANONICAL_DEMO_MANAGER_EMAIL} role is "${data.role}", expected "manager".`);
  return data.id as string;
}

async function main() {
  const managerId = await findManagerId(db);
  const props: MockProperty[] = [
    mockProperty("example-rentbyroom", managerId, rentByRoomSubmission(), 3, "$950.00–1250.00/mo"),
    mockProperty("example-entirehome", managerId, entireHomeSubmission(), 2, "$4200.00/mo"),
    mockProperty("example-bundle", managerId, bundleSubmission(), 3, "$1000.00–1100.00/mo"),
  ];
  const rows = props.map((property) => ({
    id: property.id,
    manager_user_id: managerId,
    status: "live",
    property_data: { ...property, managerUserId: managerId, adminPublishLive: true },
    row_data: {
      id: property.id,
      status: "live",
      name: property.buildingName,
      buildingName: property.buildingName,
      address: property.address,
      managerUserId: managerId,
    },
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("manager_property_records").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`upsert manager_property_records: ${error.message}`);
  console.log(
    `Upserted ${rows.length} example listings for ${CANONICAL_DEMO_MANAGER_EMAIL} (${managerId}):\n` +
      "  example-rentbyroom  (rent by bedroom — per-room rent/deposit/utilities)\n" +
      "  example-entirehome  (entire home — one whole-place rent)\n" +
      "  example-bundle      (group bundle — rooms grouped on one lease)\n" +
      "Additive/idempotent: nothing else was touched.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
