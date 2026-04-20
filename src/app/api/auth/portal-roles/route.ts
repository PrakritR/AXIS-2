import { NextResponse } from "next/server";
import type { AuthRole } from "@/components/auth/portal-switcher";
import { getPortalAccessContext } from "@/lib/auth/portal-access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await getPortalAccessContext();
    if (!ctx.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({
      roles: ctx.roles as AuthRole[],
      effectiveRole: ctx.effectiveRole,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
