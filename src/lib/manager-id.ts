import { randomBytes } from "crypto";

/** Public Axis ID (stored in the legacy `profiles.manager_id` column for all portal accounts). */
export function generateAxisId(): string {
  return `AXIS-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Backward-compatible name for existing manager signup code paths. */
export function generateManagerId(): string {
  return generateAxisId();
}
