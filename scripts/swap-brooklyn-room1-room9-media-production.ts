#!/usr/bin/env npx tsx
/**
 * ONE-TIME manual production fix — NOT a migration, NOT run on deploy.
 *
 * Swaps listing photos + video between Room 1 and Room 9 on:
 *   - 5257 Brooklyn Ave NE (mgr--9-rooms-b1wf3z)
 *   - 5259 Brooklyn Ave NE (mgr-seed-5259-brooklyn-ave-ne)
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.production.local scripts/swap-brooklyn-room1-room9-media-production.ts
 *
 * Apply (captain-approved production write):
 *   ALLOW_PRODUCTION_LISTING_WRITE=1 SWAP_BROOKLYN_ROOM1_ROOM9_CONFIRM=1 \
 *   npx tsx --env-file=.env.production.local scripts/swap-brooklyn-room1-room9-media-production.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { swapListingRoomMedia } from "../src/lib/listing-media-copy";
import {
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "../src/lib/manager-listing-submission";

const PROD_REF = (process.env.AXIS_PROD_SUPABASE_REF ?? "qahnczmilgptcedaqype").trim();
const AMBIKA_MANAGER_ID = "c49d02b1-7e99-4484-9986-b3b4550c3519";
const PROPERTY_IDS = ["mgr--9-rooms-b1wf3z", "mgr-seed-5259-brooklyn-ave-ne"] as const;
const ROOM_A = "Room 1";
const ROOM_B = "Room 9";

type PropertyRow = {
  id: string;
  manager_user_id: string | null;
  status: string | null;
  row_data: unknown;
  property_data: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function listingSubmissionOf(rec: PropertyRow): unknown {
  const propertyData = asObject(rec.property_data);
  const rowData = asObject(rec.row_data);
  return propertyData?.listingSubmission ?? rowData?.submission ?? null;
}

function listingSubmissionFromRecord(rec: PropertyRow): ManagerListingSubmissionV1 | null {
  const raw = listingSubmissionOf(rec);
  if (!raw) return null;
  return normalizeManagerListingSubmissionV1(raw as ManagerListingSubmissionV1);
}

function writeSubmissionToRecordPayloads(
  rec: PropertyRow,
  submission: ManagerListingSubmissionV1,
): { row_data: unknown; property_data: unknown } {
  const normalized = normalizeManagerListingSubmissionV1(submission);
  const rowData = asObject(rec.row_data);
  const propertyData = asObject(rec.property_data);
  const nextRow: Record<string, unknown> | null = rowData ? { ...rowData } : null;
  const nextProp: Record<string, unknown> | null = propertyData ? { ...propertyData } : null;
  if (nextRow && (asObject(nextRow.submission) || "submission" in nextRow)) {
    nextRow.submission = normalized;
  }
  if (nextProp) {
    nextProp.listingSubmission = normalized;
  }
  return { row_data: nextRow ?? rec.row_data, property_data: nextProp ?? rec.property_data };
}

function mediaLine(snapshot: { photoDataUrls: string[]; videoDataUrl: string | null }): string {
  return `${snapshot.photoDataUrls.length} photo(s), video=${snapshot.videoDataUrl ? "yes" : "no"}`;
}

function assertProductionGate(url: string, apply: boolean) {
  if (!url.includes(`${PROD_REF}.supabase.co`)) {
    console.error(`Refusing: expected production project ${PROD_REF}, got ${url}`);
    process.exit(1);
  }
  if (apply) {
    if (process.env.ALLOW_PRODUCTION_LISTING_WRITE !== "1") {
      console.error("Set ALLOW_PRODUCTION_LISTING_WRITE=1 to apply on production.");
      process.exit(1);
    }
    if (process.env.SWAP_BROOKLYN_ROOM1_ROOM9_CONFIRM !== "1") {
      console.error("Set SWAP_BROOKLYN_ROOM1_ROOM9_CONFIRM=1 to apply this one-time swap.");
      process.exit(1);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  assertProductionGate(url, apply);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from("manager_property_records")
    .select("id,manager_user_id,status,row_data,property_data")
    .in("id", [...PROPERTY_IDS]);
  if (error) {
    console.error("Read failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as PropertyRow[];
  const updates: Array<{ id: string; submission: ManagerListingSubmissionV1 }> = [];

  console.log(`Brooklyn Room 1 ↔ Room 9 media swap (${apply ? "APPLY" : "dry run"})`);

  for (const propertyId of PROPERTY_IDS) {
    const rec = rows.find((row) => row.id === propertyId);
    if (!rec) {
      console.error(`Missing property row: ${propertyId}`);
      process.exit(1);
    }
    if (rec.manager_user_id !== AMBIKA_MANAGER_ID) {
      console.error(`Refusing: ${rec.id} is not owned by Ambika (${AMBIKA_MANAGER_ID}).`);
      process.exit(1);
    }

    const submission = listingSubmissionFromRecord(rec);
    if (!submission) {
      console.error(`Could not load listing submission for ${propertyId}`);
      process.exit(1);
    }

    const result = swapListingRoomMedia(submission, ROOM_A, ROOM_B);
    if (!result.swapped) {
      console.error(`Could not swap rooms on ${propertyId}`);
      process.exit(1);
    }

    console.log(`\n${propertyId} (${rec.status})`);
    console.log(`  ${ROOM_A} before: ${mediaLine(result.before.roomA)}`);
    console.log(`  ${ROOM_B} before: ${mediaLine(result.before.roomB)}`);
    console.log(`  ${ROOM_A} after:  ${mediaLine(result.after.roomA)}`);
    console.log(`  ${ROOM_B} after:  ${mediaLine(result.after.roomB)}`);

    updates.push({ id: propertyId, submission: result.submission });
  }

  if (!apply) {
    console.log("\nDry run only — pass --apply with production confirm env vars to write.");
    return;
  }

  for (const update of updates) {
    const rec = rows.find((row) => row.id === update.id)!;
    const payloads = writeSubmissionToRecordPayloads(rec, update.submission);
    const { error: updateError } = await db
      .from("manager_property_records")
      .update({
        row_data: payloads.row_data,
        property_data: payloads.property_data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("manager_user_id", AMBIKA_MANAGER_ID);
    if (updateError) {
      console.error(`Update failed for ${update.id}:`, updateError.message);
      process.exit(1);
    }
  }

  console.log("\nApplied — only Room 1 and Room 9 listing media were swapped on both Brooklyn listings.");
}

void main();
