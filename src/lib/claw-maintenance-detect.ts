/**
 * Pure maintenance-detection helpers (safe for client + server).
 */

import type { ResidentMaintenanceCategoryLabel } from "@/lib/work-order-taxonomy";

const REPAIR_RE =
  /\b(fix|broken|broke|leaking|leak|clogged|clog|won't work|wont work|not working|doesn't work|doesnt work|out of order|flooded|no hot water|no heat|no ac|stopped working|needs repair)\b/i;
const NOUN_RE =
  /\b(toilet|sink|faucet|shower|bathtub|tub|pipe|drain|plumb|outlet|electric|heater|hvac|furnace|fridge|refrigerator|dishwasher|washer|dryer|stove|oven|microwave|lock|door|window|mold|smoke detector|garbage disposal|ac unit|air conditioner|hot water)\b/i;
const HELP_RE = /\b(please|can you|could you|help|fix it|come look|send someone)\b/i;
const EXPLICIT_RE =
  /\b(maintenance|work[\s-]?order|repair request|something('s| is) (broken|wrong)|need(s)? (a )?fix)\b/i;

/** True when the resident message looks like a maintenance / repair request. */
export function looksLikeMaintenanceRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (REPAIR_RE.test(t) && NOUN_RE.test(t)) return true;
  if (EXPLICIT_RE.test(t) && (REPAIR_RE.test(t) || NOUN_RE.test(t) || HELP_RE.test(t))) return true;
  if (REPAIR_RE.test(t) && HELP_RE.test(t)) return true;
  return false;
}

export function inferMaintenanceCategoryLabel(text: string): ResidentMaintenanceCategoryLabel {
  const t = text.toLowerCase();
  if (/\b(toilet|sink|faucet|shower|bathtub|tub|pipe|drain|plumb|leak|clog|hot water|garbage disposal)\b/.test(t)) {
    return "Plumbing";
  }
  if (/\b(outlet|electric|wiring|breaker|power|light fixture)\b/.test(t)) return "Electrical";
  if (/\b(hvac|furnace|heater|ac\b|air conditioner|no heat|no ac|thermostat)\b/.test(t)) return "HVAC";
  if (/\b(fridge|refrigerator|dishwasher|washer|dryer|stove|oven|microwave|appliance)\b/.test(t)) {
    return "Appliance";
  }
  if (/\b(lock|key|door|deadbolt|access)\b/.test(t)) return "Access / Locks";
  return "General";
}

export function inferMaintenanceTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  if (/\btoilet\b/.test(lower)) return "Toilet issue";
  if (/\bsink\b/.test(lower)) return "Sink issue";
  if (/\bleak|leaking\b/.test(lower)) return "Leak reported";
  if (/\bno (hot )?water\b/.test(lower)) return "Water issue";
  if (/\bno heat\b/.test(lower)) return "No heat";
  if (/\bno ac\b|\bair conditioner\b/.test(lower)) return "AC issue";
  if (/\block\b/.test(lower)) return "Lock / access issue";
  const first = t.split(/[.!?\n]/)[0]?.trim() || "Maintenance request";
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
}

export function inferMaintenancePriority(text: string): string {
  const t = text.toLowerCase();
  if (/\b(emergency|flooding|flooded|gas|sparking|no heat|no water|can't get in|cant get in)\b/.test(t)) {
    return "Emergency";
  }
  if (/\b(urgent|asap|immediately|right away)\b/.test(t)) return "High";
  return "Medium";
}
