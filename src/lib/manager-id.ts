import { randomBytes } from "crypto";

/**
 * Public PropLane ID (stored in the legacy `profiles.manager_id` column for all
 * portal accounts). Accounts created before the rebrand keep their `AXIS-` ids —
 * every lookup accepts both prefixes; only NEW ids use `PROPLANE-`.
 */
export function generateAxisId(): string {
  return `PROPLANE-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Backward-compatible name for existing manager signup code paths. */
export function generateManagerId(): string {
  return generateAxisId();
}
