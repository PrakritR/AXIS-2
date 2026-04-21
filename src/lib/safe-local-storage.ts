/**
 * Defensive parsing for demo localStorage JSON so corrupted or migrated shapes
 * (e.g. arrays where objects were stored) do not crash client renders.
 */

/** Parsed JSON value from localStorage, or undefined if missing / invalid. */
export function parseLocalStorageJson(key: string): unknown | undefined {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw === "") return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Ensures value is `T[]`; otherwise returns []. */
export function parseJsonArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

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
