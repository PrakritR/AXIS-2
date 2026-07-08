import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { createBankAccount, listBankAccounts } from "@/lib/manager-bank-reconciliation.server";
import type { BankAccountType } from "@/lib/manager-bank-reconciliation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const accounts = await listBankAccounts(auth.db, auth.userId);
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list accounts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      name?: string;
      accountType?: BankAccountType;
      glAccountCode?: string;
      lastFour?: string;
    };
    const account = await createBankAccount(auth.db, {
      managerUserId: auth.userId,
      name: String(body.name ?? "").trim(),
      accountType: (body.accountType ?? "operating") as BankAccountType,
      glAccountCode: body.glAccountCode,
      lastFour: body.lastFour || null,
    });
    return NextResponse.json({ account });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create account." }, { status: 500 });
  }
}
