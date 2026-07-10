import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy Axis-ID + email resident signup.
 * Residents now create accounts only via `/api/auth/resident-setup` (emailed setup link).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Resident accounts are created from the setup link in your application email. Apply first, then check your inbox.",
      useEndpoint: "/api/auth/resident-setup",
    },
    { status: 403 },
  );
}
