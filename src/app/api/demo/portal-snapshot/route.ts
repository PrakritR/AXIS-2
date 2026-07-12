import { NextResponse } from "next/server";
import {
  buildStaticDemoPortalSnapshot,
  fetchDemoGuidedMirrorSnapshot,
  fetchDemoPortalMirrorSnapshot,
} from "@/lib/demo/demo-portal-mirror.server";

export const runtime = "nodejs";

/**
 * Public read-only snapshot for `/demo` — never accepts writes.
 * Default: idle mirror of the canonical manager/resident/vendor accounts.
 * `?scope=guided`: mirror of the all-portals `testeverything@` account for the
 * guided "Run demo" tour (`source: "blank"` when that account is absent, so the
 * client seeds the blank slate the tour scripts expect).
 */
export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "guided") {
    try {
      const guided = await fetchDemoGuidedMirrorSnapshot();
      if (guided) {
        return NextResponse.json(
          { source: "mirror", snapshot: guided },
          { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=300" } },
        );
      }
      return NextResponse.json(
        { source: "blank" },
        { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load guided demo snapshot.";
      return NextResponse.json(
        { source: "blank", error: message },
        { status: 200, headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
      );
    }
  }
  try {
    const mirrored = await fetchDemoPortalMirrorSnapshot();
    if (mirrored) {
      return NextResponse.json(
        { source: "mirror", snapshot: mirrored },
        { headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=300" } },
      );
    }
    return NextResponse.json(
      { source: "static", snapshot: buildStaticDemoPortalSnapshot() },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load demo snapshot.";
    return NextResponse.json(
      { source: "static", snapshot: buildStaticDemoPortalSnapshot(), error: message },
      { status: 200, headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
    );
  }
}
