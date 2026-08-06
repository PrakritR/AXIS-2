/** Query key for multi-property list filters (Applications, Calendar, etc.). */
export const PORTAL_PROPERTY_FILTER_QUERY_KEY = "properties";

export function parsePortalPropertyFilterQuery(
  searchParams: URLSearchParams | string | null | undefined,
): string[] {
  const params =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : searchParams instanceof URLSearchParams
        ? searchParams
        : new URLSearchParams();
  const raw = params.get(PORTAL_PROPERTY_FILTER_QUERY_KEY);
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function appendPortalPropertyFilterQuery(path: string, propertyFilters: string[]): string {
  if (propertyFilters.length === 0) return path.split("?")[0] ?? path;
  const [pathname, existingQs] = path.split("?", 2);
  const params = new URLSearchParams(existingQs ?? "");
  params.set(PORTAL_PROPERTY_FILTER_QUERY_KEY, propertyFilters.join(","));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : (pathname ?? path);
}

export function sanitizePortalPropertyFilterIds(
  propertyFilters: string[],
  validIds: Iterable<string>,
): string[] {
  const allowed = new Set(validIds);
  return propertyFilters.filter((id) => allowed.has(id));
}

export function portalPropertyFilterIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
