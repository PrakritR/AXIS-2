#!/usr/bin/env node
/**
 * Restore 5259 Brooklyn Ave NE (if missing) and set per-room move-in instructions.
 *
 * Usage:
 *   node --env-file=.env.local scripts/restore-brooklyn-move-in.mjs
 *   node --env-file=.env.production.local scripts/restore-brooklyn-move-in.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_ID = "mgr-seed-5259-brooklyn-ave-ne";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const HOUSE_CODES = [
  "Access codes:",
  "House code: 7500",
  "Front gate: 075",
  "Back gate: 7501",
  "Pantry: 9752",
  "Backup house code: 2572",
].join("\n");

const ROOM_NOTES = {
  "seed-5259-brooklyn-room-1": "Assigned to Room 1 (2-person bathroom share with Room 2).",
  "seed-5259-brooklyn-room-2": "Assigned to Room 2 (2-person bathroom share with Room 1).",
  "seed-5259-brooklyn-room-3": "Assigned to Room 3 (3-person bathroom share with Rooms 4 & 5).",
  "seed-5259-brooklyn-room-4": "Assigned to Room 4 (3-person bathroom share with Rooms 3 & 5).",
  "seed-5259-brooklyn-room-5": "Assigned to Room 5 (3-person bathroom share with Rooms 3 & 4).",
  "seed-5259-brooklyn-room-6": "Assigned to Room 6 (4-person bathroom share with Rooms 7, 8 & 9).",
  "seed-5259-brooklyn-room-7": "Assigned to Room 7 (4-person bathroom share with Rooms 6, 8 & 9).",
  "seed-5259-brooklyn-room-8": "Assigned to Room 8 (4-person bathroom share with Rooms 6, 7 & 9).",
  "seed-5259-brooklyn-room-9": "Assigned to Room 9 (4-person bathroom share with Rooms 6, 7 & 8).",
};

function roomMoveIn(roomId, roomNum) {
  return [
    ROOM_NOTES[roomId],
    "",
    HOUSE_CODES,
    "",
    `Use front gate code 075, then house code 7500 at the front door. Your bedroom is Room ${roomNum}.`,
  ].join("\n");
}

function loadRestorePropertyData() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/20260730124500_restore_5259_brooklyn_production.sql"),
    "utf8",
  );
  return JSON.parse(sql.match(/'(\{.*\})'/s)[1]);
}

function applyMoveInInstructions(propertyData) {
  const sub = propertyData.listingSubmission;
  sub.generalHouseInfo = [
    "Access codes for 5259 Brooklyn Ave NE:",
    "House code: 7500",
    "Front gate: 075",
    "Back gate: 7501",
    "Pantry: 9752",
    "Backup house code: 2572",
  ].join("\n");
  for (const room of sub.rooms) {
    const num = room.name.replace("Room ", "");
    room.moveInInstructions = roomMoveIn(room.id, num);
  }
  return propertyData;
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
    `/rest/v1/manager_property_records?id=eq.${PROPERTY_ID}&select=manager_user_id`,
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
  const propertyData = applyMoveInInstructions(loadRestorePropertyData());
  propertyData.managerUserId = managerUserId;

  const body = {
    id: PROPERTY_ID,
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
  console.log(`[${ref}] Restored/updated ${PROPERTY_ID} for manager ${managerUserId}`);
  console.log(`[${ref}] Room 4 move-in set (${room4.moveInInstructions.length} chars)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
