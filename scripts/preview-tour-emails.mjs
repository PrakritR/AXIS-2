#!/usr/bin/env node
/**
 * Print sample scheduled-tour notification copy for review.
 * Run: node scripts/preview-tour-emails.mjs
 */

const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.prop-lane.space";
const propertyId = "demo_property_1";
const applyUrl = `${origin}/rent/apply?propertyId=${encodeURIComponent(propertyId)}&roomName=${encodeURIComponent("Room 2A")}`;

const managerSubject = "New tour request — PropLane";
const managerBody = [
  "Hi,",
  "",
  "Someone requested a property tour through PropLane.",
  "",
  "Guest: Alex Chen (alex@example.com)",
  "Phone: (206) 555-0100",
  "Property: Sunset House",
  "Room: Room 2A",
  "Address: 123 Main St, Seattle, WA",
  "Requested time: Mon Jun 22, 11:00 AM – 11:30 AM",
  "",
  "Notes from guest:",
  "Looking for a quiet room near transit.",
  "",
  "Open your PropLane manager portal calendar to approve or decline this tour request.",
  "",
  "— PropLane",
].join("\n");

const tenantSubject = "Your PropLane tour is confirmed";
const tenantBody = [
  "Hi Alex Chen,",
  "",
  "Your property tour is confirmed.",
  "",
  "When: Mon Jun 22, 11:00 AM – 11:30 AM",
  "Property: Sunset House",
  "Room: Room 2A",
  "Address: 123 Main St, Seattle, WA",
  "Host: Jordan Lee",
  "",
  "Next step — apply for this home",
  "If you are interested after your tour, submit your rental application using the link below:",
  applyUrl,
  "",
  "What to expect in the application:",
  "• Basic contact and household information",
  "• Employment and income details",
  "• Application fee payment (when required for this listing)",
  "",
  "Questions before or after your tour? Reply in your PropLane inbox and your property team will help.",
  "",
  "— PropLane",
].join("\n");

console.log("=== Manager: new tour request ===");
console.log(`Subject: ${managerSubject}\n`);
console.log(managerBody);
console.log("\n\n=== Guest: tour confirmed ===");
console.log(`Subject: ${tenantSubject}\n`);
console.log(tenantBody);
