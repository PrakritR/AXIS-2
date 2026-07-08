import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { listPropertyOwners, upsertPropertyOwner } from "@/lib/manager-owner-distributions.server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const propertyId = new URL(req.url).searchParams.get("propertyId")?.trim() || undefined;
    const owners = await listPropertyOwners(auth.db, auth.userId, propertyId);
    return NextResponse.json({ owners });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list owners." }, { status: 500 });
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
      ownerName?: string;
      ownerEmail?: string;
      ownershipPct?: number;
    };
    const owner = await upsertPropertyOwner(auth.db, {
      managerUserId: auth.userId,
      propertyId: String(body.propertyId ?? "").trim(),
      ownerName: String(body.ownerName ?? "").trim(),
      ownerEmail: body.ownerEmail || null,
      ownershipPct: body.ownershipPct,
    });
    return NextResponse.json({ owner });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save owner." }, { status: 500 });
  }
}
