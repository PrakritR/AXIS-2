/**
 * Ensures parsed JSON is a plain object whose values are arrays (empty array for bad values).
 * Arrays and primitives become `{}`.
 */
export function parseRecordOfArrays<T>(raw: unknown): Record<string, T[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, T[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k) continue;
    out[k] = Array.isArray(v) ? (v as T[]) : [];
  }
  return out;
}
