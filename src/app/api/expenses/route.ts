import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { chartAccountLabel, SYSTEM_CHART_ACCOUNTS } from "@/lib/reports/categories";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const categories = SYSTEM_CHART_ACCOUNTS.filter((a) => a.accountType === "expense").map((a) => ({
      code: a.code,
      name: a.name,
    }));

    const { data, error } = await auth.db
      .from("manager_expense_entries")
      .select("*")
      .eq("manager_user_id", auth.userId)
      .order("expense_date", { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      categories,
      expenses: (data ?? []).map((e) => ({
        id: e.id,
        propertyId: e.property_id,
        categoryCode: e.category_code,
        categoryLabel: chartAccountLabel(e.category_code),
        amountCents: Number(e.amount_cents),
        expenseDate: e.expense_date,
        memo: e.memo,
        vendorId: e.vendor_id,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load expenses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
      expenseDate?: string;
      memo?: string;
      vendorId?: string;
    };

    const amountCents = Number(body.amountCents);
    if (!(amountCents > 0)) {
      return NextResponse.json({ error: "amountCents must be positive." }, { status: 400 });
    }
    if (!body.expenseDate?.trim()) {
      return NextResponse.json({ error: "expenseDate required." }, { status: 400 });
    }
    if (!body.categoryCode?.trim()) {
      return NextResponse.json({ error: "categoryCode required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data, error } = await auth.db
      .from("manager_expense_entries")
      .insert({
        manager_user_id: auth.userId,
        property_id: body.propertyId?.trim() || null,
        category_code: body.categoryCode.trim(),
        amount_cents: amountCents,
        expense_date: body.expenseDate.trim(),
        memo: body.memo?.trim() || null,
        vendor_id: body.vendorId?.trim() || null,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ expense: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create expense.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

    const { error } = await auth.db
      .from("manager_expense_entries")
      .delete()
      .eq("id", id)
      .eq("manager_user_id", auth.userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete expense.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
