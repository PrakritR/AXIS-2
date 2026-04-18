import { randomBytes } from "crypto";

export function generateManagerId(): string {
  return `MGR-${randomBytes(4).toString("hex").toUpperCase()}`;
}
