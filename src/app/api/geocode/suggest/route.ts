import { NextResponse } from "next/server";
import { parseNominatimAddressSuggestions } from "@/lib/geocode-address";
import { nominatimUserAgent, throttleNominatim } from "@/lib/nominatim.server";

export const runtime = "nodejs";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const suggestCache = new Map<string, { suggestions: ReturnType<typeof parseNominatimAddressSuggestions>; at: number }>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Address autocomplete for listing create (OpenStreetMap Nominatim). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const key = cacheKey(q);
  const cached = suggestCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { suggestions: cached.suggestions },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }

  try {
    await throttleNominatim();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "us");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": nominatimUserAgent() },
      next: { revalidate: 60 * 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Address lookup failed." }, { status: 502 });
    }

    const rows = (await res.json()) as unknown;
    const suggestions = parseNominatimAddressSuggestions(rows);
    suggestCache.set(key, { suggestions, at: Date.now() });

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Address lookup failed." }, { status: 502 });
  }
}
