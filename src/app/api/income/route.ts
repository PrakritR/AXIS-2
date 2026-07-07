import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { SYSTEM_CHART_ACCOUNTS } from "@/lib/reports/categories";

export const runtime = "nodejs";

const INCOME_CODES = new Set(
  SYSTEM_CHART_ACCOUNTS.filter((a) => a.accountType === "income").map((a) => a.code),
);

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

    const amountCents = Number(body.amountCents);
    if (!(amountCents > 0)) {
      return NextResponse.json({ error: "amountCents must be positive." }, { status: 400 });
    }
    if (!body.postedDate?.trim()) {
      return NextResponse.json({ error: "postedDate required." }, { status: 400 });
    }

    const categoryCode = (body.categoryCode?.trim() || "other_income");
    if (!INCOME_CODES.has(categoryCode)) {
      return NextResponse.json({ error: "Invalid income category." }, { status: 400 });
    }

    const description = body.description?.trim() || "Manual income entry";
    const residentEmail = body.residentEmail?.trim().toLowerCase() || null;
    const now = new Date().toISOString();

    const { data, error } = await auth.db
      .from("ledger_entries")
      .insert({
        manager_user_id: auth.userId,
        resident_user_id: null,
        resident_email: residentEmail,
        property_id: body.propertyId?.trim() || null,
        unit_label: "",
        lease_id: null,
        entry_type: "payment",
        category_code: categoryCode,
        amount_cents: amountCents,
        due_date: null,
        posted_date: body.postedDate.trim(),
        source_charge_id: null,
        description,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    track("income_created", auth.userId, { category_code: categoryCode });
    return NextResponse.json({ entry: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create income entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
