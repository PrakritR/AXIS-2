import { NextResponse } from "next/server";
import {
  buildStaticDemoPortalSnapshot,
  fetchDemoPortalMirrorSnapshot,
} from "@/lib/demo/demo-portal-mirror.server";

export const runtime = "nodejs";

/** Public read-only snapshot for `/demo` — never accepts writes. */
export async function GET() {
  try {
    const mirrored = await fetchDemoPortalMirrorSnapshot();
    if (mirrored) {
      return NextResponse.json(
        { source: "mirror", snapshot: mirrored },
        { headers: { "Cache-Control": "private, max-age=30" } },
      );
    }
    return NextResponse.json(
      { source: "static", snapshot: buildStaticDemoPortalSnapshot() },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load demo snapshot.";
    return NextResponse.json(
      { source: "static", snapshot: buildStaticDemoPortalSnapshot(), error: message },
      { status: 200, headers: { "Cache-Control": "private, max-age=60" } },
    );
  }
}
