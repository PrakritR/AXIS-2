/** Shared Nominatim helpers (1 req/s throttle + User-Agent). Server-only. */

// Serialized queue: concurrent callers chain onto the tail so requests leave
// at most one per 1.1s even under parallel load (Nominatim's usage policy is
// 1 req/s per app; the old racy last-timestamp check let bursts through).
let throttleTail: Promise<void> = Promise.resolve();

export function throttleNominatim(): Promise<void> {
  const slot = throttleTail;
  throttleTail = throttleTail.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
  );
  return slot;
}

export function nominatimUserAgent(): string {
  return (
    process.env.GEOCODE_USER_AGENT?.trim() ||
    "Axis-Seattle-Housing/1.0 (+https://www.axis-seattle-housing.com; geocode@axis-seattle-housing.com)"
  );
}

/** Insert into a bounded cache, evicting the oldest entry beyond `max`. */
export function boundedCacheSet<V>(cache: Map<string, V>, key: string, value: V, max = 2000): void {
  if (cache.size >= max && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}
