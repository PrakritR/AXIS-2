import { randomBytes } from "crypto";

/** Public Axis ID (stored in `profiles.manager_id` for Axis Pro / property portal accounts). */
export function generateManagerId(): string {
  return `AXIS-${randomBytes(4).toString("hex").toUpperCase()}`;
}
