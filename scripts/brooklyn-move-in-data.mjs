/** 5259 Brooklyn Ave NE — move-in copy shared by restore script + migrations. */

export const BROOKLYN_PROPERTY_ID = "mgr-seed-5259-brooklyn-ave-ne";

export const BROOKLYN_GENERAL_HOUSE_INFO = [
  "Front door code: 7500",
  "Front gate code: 075",
  "Back gate code: 075",
  "",
  "Wifi Name: Brooklyn House",
  "Wifi Password: brooklyn5259",
  "",
  "Trash Day: Tuesday morning",
  "Recycle/Compost Day: Tuesday morning",
].join("\n");

export const BROOKLYN_HOUSE_DESCRIPTION = [
  "House Code is 7500.",
  "Front Gate Code is 075.",
  "Back Gate Code is 075.",
].join("\n");

export const BROOKLYN_ROOM_NOTES = {
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

/** Per-room locker box combinations (10-digit). Room 3 pending on source sheet. */
export const BROOKLYN_LOCKER_COMBINATIONS = {
  "seed-5259-brooklyn-room-1": "8916566666",
  "seed-5259-brooklyn-room-2": "7820341022",
  "seed-5259-brooklyn-room-3": null,
  "seed-5259-brooklyn-room-4": "9031576091",
  "seed-5259-brooklyn-room-5": "2216261232",
  "seed-5259-brooklyn-room-6": "9187794484",
  "seed-5259-brooklyn-room-7": "8357106792",
  "seed-5259-brooklyn-room-8": "3282362130",
  "seed-5259-brooklyn-room-9": "0831979973",
};

function houseAccessCodesBlock() {
  return [
    "Access codes:",
    "Front door code: 7500",
    "Front gate code: 075",
    "Back gate code: 075",
  ].join("\n");
}

function lockerLine(roomId) {
  const combo = BROOKLYN_LOCKER_COMBINATIONS[roomId];
  if (combo) return `Locker box combination: ${combo}`;
  return "Locker box combination: pending — your property manager will send it before move-in.";
}

export function brooklynRoomMoveInInstructions(roomId, roomNum) {
  return [
    BROOKLYN_ROOM_NOTES[roomId],
    "",
    houseAccessCodesBlock(),
    "",
    lockerLine(roomId),
    "",
    `Use front gate code 075, then front door code 7500. Your bedroom is Room ${roomNum}.`,
  ].join("\n");
}

export function applyBrooklynMoveInInstructions(propertyData) {
  const sub = propertyData.listingSubmission;
  sub.generalHouseInfo = BROOKLYN_GENERAL_HOUSE_INFO;
  sub.houseDescription = BROOKLYN_HOUSE_DESCRIPTION;
  for (const room of sub.rooms) {
    const num = room.name.replace("Room ", "").trim() || String(sub.rooms.indexOf(room) + 1);
    room.moveInInstructions = brooklynRoomMoveInInstructions(room.id, num);
  }
  return propertyData;
}
