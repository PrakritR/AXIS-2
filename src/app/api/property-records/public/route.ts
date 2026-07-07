import { NextResponse } from "next/server";
import { getPublicListings } from "@/lib/public-listings.server";

export const runtime = "nodejs";

/** Public catalog of admin-approved live manager listings (apply / browse). */
export async function GET() {
  try {
    const listings = await getPublicListings();
    // Public catalog, same for everyone: let the CDN serve repeats without
    // re-querying Supabase. s-maxage bounds staleness after a manager publishes.
    return NextResponse.json(
      { listings },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load public listings." },
      { status: 500 },
    );
  }
}
