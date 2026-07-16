import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { recordManualIncome } from "@/lib/reports/manual-entries.server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      propertyId?: string;
      categoryCode?: string;
      amountCents?: number;
      postedDate?: string;
      description?: string;
      residentEmail?: string;
    };

    const result = await recordManualIncome(auth.db, auth.userId, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ entry: result.entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create income entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
