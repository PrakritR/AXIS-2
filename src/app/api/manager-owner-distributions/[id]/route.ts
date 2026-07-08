import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { approveOwnerDistribution, payOwnerDistribution } from "@/lib/manager-owner-distributions.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: "approve" | "pay" };

    if (body.action === "approve") {
      const distribution = await approveOwnerDistribution(auth.db, auth.userId, id);
      return NextResponse.json({ distribution });
    }
    if (body.action === "pay") {
      const distribution = await payOwnerDistribution(auth.db, auth.userId, id);
      track("owner_distribution_paid", auth.userId, {
        distributionId: distribution.id,
        amountCents: distribution.distributionCents,
      });
      return NextResponse.json({ distribution });
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Distribution update failed." }, { status: 500 });
  }
}
