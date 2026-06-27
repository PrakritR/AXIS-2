import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { encryptTin, tinLast4 } from "@/lib/reports/tin-crypto";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: vendorId } = await ctx.params;
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data, error } = await auth.db
      .from("vendor_tax_profiles")
      .select(
        "vendor_id, legal_name, business_name, entity_type, address_line1, address_line2, city, state, zip, tin_type, tin_last4, w9_received_at, w9_attestation",
      )
      .eq("vendor_id", vendorId)
      .eq("manager_user_id", auth.userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tax profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: vendorId } = await ctx.params;
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      legalName?: string;
      businessName?: string;
      entityType?: "individual" | "business";
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      zip?: string;
      tinType?: "ein" | "ssn";
      tin?: string;
      w9Attestation?: boolean;
    };

    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      vendor_id: vendorId,
      manager_user_id: auth.userId,
      legal_name: body.legalName?.trim() || null,
      business_name: body.businessName?.trim() || null,
      entity_type: body.entityType ?? null,
      address_line1: body.addressLine1?.trim() || null,
      address_line2: body.addressLine2?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip?.trim() || null,
      w9_attestation: body.w9Attestation === true,
      updated_at: now,
    };

    if (body.tinType) row.tin_type = body.tinType;
    if (body.tin?.trim()) {
      row.tin_ciphertext = encryptTin(body.tin.trim());
      row.tin_last4 = tinLast4(body.tin.trim());
      row.w9_received_at = now;
    }

    const { data, error } = await auth.db
      .from("vendor_tax_profiles")
      .upsert(row, { onConflict: "vendor_id" })
      .select(
        "vendor_id, legal_name, business_name, entity_type, address_line1, address_line2, city, state, zip, tin_type, tin_last4, w9_received_at, w9_attestation",
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save tax profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
