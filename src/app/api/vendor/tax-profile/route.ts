import { NextResponse } from "next/server";
import { resolveVendorPortalUserId } from "@/lib/auth/vendor-api-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { encryptTin, tinLast4 } from "@/lib/reports/tin-crypto";
import { resolveOwnVendorRecord } from "@/lib/vendor-own-record";

export const runtime = "nodejs";

async function resolveOwnVendorRow(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
): Promise<{ managerUserId: string; vendorId: string } | null> {
  const own = await resolveOwnVendorRecord(db, userId);
  if (!own) return null;
  return { managerUserId: own.managerUserId, vendorId: own.id };
}

export async function GET() {
  try {
    const auth = await resolveVendorPortalUserId();
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Unauthorized." : "Forbidden." },
        { status: auth.status },
      );
    }

    const db = createSupabaseServiceRoleClient();
    const own = await resolveOwnVendorRow(db, auth.userId);
    if (!own) return NextResponse.json({ profile: null, linked: false });

    const { data, error } = await db
      .from("vendor_tax_profiles")
      .select(
        "vendor_id, legal_name, business_name, entity_type, address_line1, address_line2, city, state, zip, tin_type, tin_last4, w9_received_at, w9_attestation",
      )
      .eq("vendor_id", own.vendorId)
      .eq("manager_user_id", own.managerUserId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data ?? null, linked: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tax profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await resolveVendorPortalUserId();
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Unauthorized." : "Forbidden." },
        { status: auth.status },
      );
    }

    const db = createSupabaseServiceRoleClient();
    const own = await resolveOwnVendorRow(db, auth.userId);
    if (!own) return NextResponse.json({ error: "No linked manager found for this vendor account." }, { status: 400 });

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
      vendor_id: own.vendorId,
      manager_user_id: own.managerUserId,
      vendor_user_id: auth.userId,
      submitted_by_vendor: true,
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

    const { data, error } = await db
      .from("vendor_tax_profiles")
      .upsert(row, { onConflict: "manager_user_id,vendor_id" })
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
