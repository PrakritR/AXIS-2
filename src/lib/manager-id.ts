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

/** Customer-facing PropLane ID — legacy `AXIS-` values are shown as `PROPLANE-`. */
export function formatProplaneIdForDisplay(id: string): string {
  const raw = id.trim();
  if (!raw) return raw;
  if (raw.toUpperCase().startsWith("AXIS-")) return `PROPLANE-${raw.slice(5)}`;
  return raw;
}

/** DB lookup accepts both legacy `AXIS-` and current `PROPLANE-` application ids. */
export function proplaneIdLookupVariants(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();
  const variants = new Set<string>([trimmed]);
  if (upper.startsWith("AXIS-")) {
    const suffix = trimmed.slice(5);
    variants.add(`AXIS-${suffix}`);
    variants.add(`PROPLANE-${suffix}`);
  } else if (upper.startsWith("PROPLANE-")) {
    const suffix = trimmed.slice(9);
    variants.add(`PROPLANE-${suffix}`);
    variants.add(`AXIS-${suffix}`);
  }
  return [...variants];
}
