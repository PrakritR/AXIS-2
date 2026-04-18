/** Radius choices (miles) — home hero + listings URL. */
export const RADIUS_MILE_OPTIONS = [5, 10, 15, 25, 50] as const;
export type RadiusMiles = (typeof RADIUS_MILE_OPTIONS)[number];

export function parseUSZip(raw: string): number | null {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length !== 5) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Demo proximity: compare 5-digit ZIPs numerically; allowance grows with radius.
 * Not geographic distance — replace with geocoding + Haversine when backend exists.
 */
export function propertyMatchesZipRadius(
  propertyZip: string,
  centerZip: string,
  radiusMiles: number,
): boolean {
  const c = parseUSZip(centerZip);
  const p = parseUSZip(propertyZip);
  if (c === null || p === null) return true;
  const diff = Math.abs(p - c);
  const allowance = Math.max(3, Math.round(radiusMiles * 2.2));
  return diff <= allowance;
}

export function parseRadiusParam(raw: string | undefined): RadiusMiles {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (RADIUS_MILE_OPTIONS.includes(n as RadiusMiles)) return n as RadiusMiles;
  return 10;
}

/** First dollar amount in a label like "$950 / mo" — demo-only until rent is numeric in the API. */
export function parseMonthlyRent(rentLabel: string): number | null {
  const m = rentLabel.replace(/,/g, "").match(/\$(\d+)/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function propertyWithinMaxBudget(rentLabel: string, maxBudget: number | null): boolean {
  if (maxBudget === null || !Number.isFinite(maxBudget)) return true;
  const rent = parseMonthlyRent(rentLabel);
  if (rent === null) return true;
  return rent <= maxBudget;
}
