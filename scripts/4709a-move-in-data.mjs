/** 4709A 8th Ave NE — move-in copy shared by restore script + migrations. */

export const A4709A_PROPERTY_ID = "mgr-seed-4709a-8th-ave-ne";

/** Preserved resident portal copy (wifi, WhatsApp, Services/Payments help). */
export const A4709A_GENERAL_HOUSE_INFO_TAIL = [
  "WiFi Username: 4709A",
  "WiFi Password: 4709A4709A$$",
  "",
  "House Groupchat: https://chat.whatsapp.com/JVe6jPceStL8pGDBSsVQBB?mode=gi_t",
  "",
  "Services:",
  'If something in your room or the house breaks or needs attention, this is how you flag it. Head to Services, hit "Report maintenance," describe the issue, set a priority, and note when you\'re free for someone to come by. Your property manager gets notified automatically — no need to text or call anyone.',
  "Need something extra during your stay? Services lets you request add-ons directly through the portal. Current offerings include luggage storage ($5/piece), room cleaning ($10), and a bedding set (free for short stays under 5 days, $30 for long-term). Just select what you need and send the request — no chasing down the manager.",
  "",
  "Payments, Lease & Inbox:",
  "Pay rent, review your lease terms, and communicate with your property manager all in one place — everything documented and accessible anytime. Additionally if you want to extend lease can do through lease tab.",
].join("\n");

export const A4709A_GENERAL_HOUSE_INFO = ["Front door code: 001000", "", A4709A_GENERAL_HOUSE_INFO_TAIL].join(
  "\n",
);

export const A4709A_HOUSE_DESCRIPTION = "Front door code: 001000.";

/** Per-room locker box combinations (10-digit). Room 3 pending on source sheet. */
export const A4709A_LOCKER_COMBINATIONS = {
  "seed-4709a-room-1": "8916566666",
  "seed-4709a-room-2": "7820341022",
  "seed-4709a-room-3": null,
  "seed-4709a-room-4": "9031576091",
  "seed-4709a-room-5": "2216261232",
  "seed-4709a-room-6": "9187794484",
  "seed-4709a-room-7": "8357106792",
  "seed-4709a-room-8": "3282362130",
  "seed-4709a-room-9": "0831979973",
  "seed-4709a-room-10": "7088326848",
};

function houseAccessCodesBlock() {
  return ["Access codes:", "Front door code: 001000"].join("\n");
}

function lockerLine(roomId) {
  const combo = A4709A_LOCKER_COMBINATIONS[roomId];
  if (combo) return `Locker box combination: ${combo}`;
  return "Locker box combination: pending — your property manager will send it before move-in.";
}

export function a4709aRoomMoveInInstructions(roomId, roomNum) {
  return [
    `Assigned to Room ${roomNum}.`,
    "",
    houseAccessCodesBlock(),
    "",
    lockerLine(roomId),
    "",
    `Use front door code 001000. Your bedroom is Room ${roomNum}.`,
  ].join("\n");
}

export function apply4709aMoveInInstructions(propertyData) {
  const sub = propertyData.listingSubmission;
  sub.generalHouseInfo = A4709A_GENERAL_HOUSE_INFO;
  sub.houseDescription = A4709A_HOUSE_DESCRIPTION;
  for (const room of sub.rooms) {
    const num = room.name.replace("Room ", "").trim() || String(sub.rooms.indexOf(room) + 1);
    room.moveInInstructions = a4709aRoomMoveInInstructions(room.id, num);
  }
  return propertyData;
}
