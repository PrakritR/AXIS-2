import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { buildVendorAcceptedPaymentMethods } from "@/lib/vendor-payment-methods";
import { resolveOwnVendorRecord } from "@/lib/vendor-own-record";

export const runtime = "nodejs";

/** Resolves the signed-in vendor's own directory row — never trusts client input for the id/manager link. */
async function requireVendor(): Promise<
  | { ok: true; userId: string; db: ReturnType<typeof createSupabaseServiceRoleClient> }
  | { ok: false; response: NextResponse }
> {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (String(profile?.role ?? "").toLowerCase() !== "vendor") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, db };
}

export async function GET() {
  try {
    const auth = await requireVendor();
    if (!auth.ok) return auth.response;

    const own = await resolveOwnVendorRecord(auth.db, auth.userId);
    return NextResponse.json({ profile: own?.row ?? null, linked: own !== null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load vendor profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireVendor();
    if (!auth.ok) return auth.response;

    const own = await resolveOwnVendorRecord(auth.db, auth.userId);
    if (!own) {
      return NextResponse.json({ error: "No linked manager found for this vendor account." }, { status: 400 });
    }

    const body = (await req.json()) as {
      name?: string;
      phone?: string;
      email?: string;
      trades?: string[];
      insuranceProvider?: string;
      insurancePolicyNumber?: string;
      insuranceExpiresAt?: string;
      zellePaymentsEnabled?: boolean;
      zelleContact?: string;
      venmoPaymentsEnabled?: boolean;
      venmoContact?: string;
      achPaymentsEnabled?: boolean;
      acceptedPaymentMethods?: ("zelle" | "venmo" | "ach")[];
    };

    const zellePaymentsEnabled =
      body.zellePaymentsEnabled !== undefined ? body.zellePaymentsEnabled : own.row.zellePaymentsEnabled;
    const zelleContact = body.zelleContact !== undefined ? body.zelleContact.trim() : own.row.zelleContact;
    const venmoPaymentsEnabled =
      body.venmoPaymentsEnabled !== undefined ? body.venmoPaymentsEnabled : own.row.venmoPaymentsEnabled;
    const venmoContact = body.venmoContact !== undefined ? body.venmoContact.trim() : own.row.venmoContact;
    const achPaymentsEnabled =
      body.achPaymentsEnabled !== undefined ? body.achPaymentsEnabled : own.row.achPaymentsEnabled;
    const acceptedPaymentMethods =
      body.acceptedPaymentMethods !== undefined
        ? body.acceptedPaymentMethods
        : buildVendorAcceptedPaymentMethods({
            zellePaymentsEnabled: Boolean(zellePaymentsEnabled),
            zelleContact: zelleContact ?? "",
            venmoPaymentsEnabled: Boolean(venmoPaymentsEnabled),
            venmoContact: venmoContact ?? "",
            achPaymentsEnabled: Boolean(achPaymentsEnabled),
          });

    const nextRow: ManagerVendorRow = {
      ...own.row,
      id: own.id,
      managerUserId: own.managerUserId,
      name: body.name !== undefined ? body.name.trim() : own.row.name,
      phone: body.phone !== undefined ? body.phone.trim() : own.row.phone,
      email: body.email !== undefined ? body.email.trim().toLowerCase() : own.row.email,
      trades: Array.isArray(body.trades)
        ? [...new Set(body.trades.map((t) => t.trim()).filter(Boolean))]
        : own.row.trades,
      insuranceProvider: body.insuranceProvider !== undefined ? body.insuranceProvider.trim() : own.row.insuranceProvider,
      insurancePolicyNumber:
        body.insurancePolicyNumber !== undefined ? body.insurancePolicyNumber.trim() : own.row.insurancePolicyNumber,
      insuranceExpiresAt:
        body.insuranceExpiresAt !== undefined ? body.insuranceExpiresAt.trim() : own.row.insuranceExpiresAt,
      zellePaymentsEnabled,
      zelleContact,
      venmoPaymentsEnabled,
      venmoContact,
      achPaymentsEnabled,
      acceptedPaymentMethods,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await auth.db
      .from("manager_vendor_records")
      .update({ row_data: nextRow, updated_at: new Date().toISOString() })
      .eq("id", own.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: nextRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save vendor profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
