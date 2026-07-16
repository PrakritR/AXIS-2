/** Shared Nominatim helpers (1 req/s throttle + User-Agent). Server-only. */

let lastNominatimRequestAt = 0;

export async function throttleNominatim(): Promise<void> {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimRequestAt = Date.now();
}

export function nominatimUserAgent(): string {
  return (
    process.env.GEOCODE_USER_AGENT?.trim() ||
    "Axis-Seattle-Housing/1.0 (+https://www.axis-seattle-housing.com; geocode@axis-seattle-housing.com)"
  );
}
