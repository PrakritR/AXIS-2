import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data, error } = await auth.db
      .from("manager_tax_profiles")
      .select("legal_name, address_line1, address_line2, city, state, zip, tin_type, tin_last4")
      .eq("manager_user_id", auth.userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load manager tax profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      legalName?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      zip?: string;
      tinType?: "ein" | "ssn";
      tin?: string;
    };

    const { encryptTin, tinLast4 } = await import("@/lib/reports/tin-crypto");
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      manager_user_id: auth.userId,
      legal_name: body.legalName?.trim() || null,
      address_line1: body.addressLine1?.trim() || null,
      address_line2: body.addressLine2?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip?.trim() || null,
      updated_at: now,
    };

    if (body.tinType) row.tin_type = body.tinType;
    if (body.tin?.trim()) {
      row.tin_ciphertext = encryptTin(body.tin.trim());
      row.tin_last4 = tinLast4(body.tin.trim());
    }

    const { data, error } = await auth.db
      .from("manager_tax_profiles")
      .upsert(row, { onConflict: "manager_user_id" })
      .select("legal_name, address_line1, address_line2, city, state, zip, tin_type, tin_last4")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save manager tax profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
