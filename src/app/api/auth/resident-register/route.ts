import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Generic resident self-serve signup is disabled.
 * Residents create accounts from the one-time setup link emailed after applying.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Resident accounts are created from the setup link in your application email. Apply first, then check your inbox.",
      redirectTo: "/rent/browse",
    },
    { status: 403 },
  );
}
