import { NextResponse } from "next/server";
import type { AuthRole } from "@/components/auth/portal-switcher";
import { getPortalAccessContext, reachablePortalRoles } from "@/lib/auth/portal-access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await getPortalAccessContext();
    if (!ctx.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    // Only expose portals the account may actually enter in this runtime, so the
    // portal switch and choose-portal chooser never offer a blocked crossing
    // (e.g. a production admin identity into the manager/property portal).
    return NextResponse.json({
      roles: reachablePortalRoles(ctx) as AuthRole[],
      effectiveRole: ctx.effectiveRole,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
