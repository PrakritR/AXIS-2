import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { createOwnerDistribution, listOwnerDistributions } from "@/lib/manager-owner-distributions.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const url = new URL(req.url);
    const distributions = await listOwnerDistributions(auth.db, auth.userId, {
      propertyId: url.searchParams.get("propertyId")?.trim() || undefined,
      status: url.searchParams.get("status")?.trim() || undefined,
    });
    return NextResponse.json({ distributions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list distributions." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      propertyId?: string;
      ownerId?: string;
      periodStart?: string;
      periodEnd?: string;
      beginningBalanceCents?: number;
      cashInCents?: number;
      cashOutCents?: number;
      managementFeeCents?: number;
      reserveHoldbackCents?: number;
      adjustmentsCents?: number;
      memo?: string;
    };

    const distribution = await createOwnerDistribution(auth.db, {
      managerUserId: auth.userId,
      propertyId: String(body.propertyId ?? "").trim(),
      ownerId: body.ownerId || null,
      periodStart: String(body.periodStart ?? ""),
      periodEnd: String(body.periodEnd ?? ""),
      beginningBalanceCents: body.beginningBalanceCents,
      cashInCents: body.cashInCents,
      cashOutCents: body.cashOutCents,
      managementFeeCents: body.managementFeeCents,
      reserveHoldbackCents: body.reserveHoldbackCents,
      adjustmentsCents: body.adjustmentsCents,
      memo: body.memo,
    });
    track("owner_distribution_created", auth.userId, {
      distributionId: distribution.id,
      amountCents: distribution.distributionCents,
    });
    return NextResponse.json({ distribution });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create distribution." }, { status: 500 });
  }
}
