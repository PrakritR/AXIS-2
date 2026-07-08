import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { resolveOwnVendorRecords } from "@/lib/vendor-own-record";
import { track } from "@/lib/analytics/posthog";
import {
  mapVendorInvoiceRow,
  normalizeLineItems,
  sumLineItemsCents,
  VENDOR_INVOICE_SELECT,
} from "@/lib/vendor-invoices";

export const runtime = "nodejs";

async function requireVendor(): Promise<
  | { ok: true; userId: string; db: ReturnType<typeof createSupabaseServiceRoleClient> }
  | { ok: false; status: number; error: string }
> {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized." };
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (String(profile?.role ?? "").toLowerCase() !== "vendor") {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  return { ok: true, userId: user.id, db };
}

/** Returns the signed-in vendor's own invoices, most recent first. */
export async function GET() {
  try {
    const gate = await requireVendor();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data, error } = await gate.db
      .from("vendor_invoices")
      .select(VENDOR_INVOICE_SELECT)
      .eq("vendor_user_id", gate.userId)
      .order("submitted_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invoices: (data ?? []).map(mapVendorInvoiceRow) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Vendor submits a new invoice to one of the managers they're linked to. */
export async function POST(req: Request) {
  try {
    const gate = await requireVendor();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const { db, userId } = gate;

    const body = (await req.json()) as {
      managerUserId?: string;
      workOrderId?: string;
      invoiceNumber?: string;
      lineItems?: unknown;
      taxCents?: number;
      memo?: string;
    };

    // Resolve which manager this vendor may bill — never trust a client-supplied
    // vendor_id/manager pairing. The vendor can only bill managers they're linked to.
    const links = await resolveOwnVendorRecords(db, userId);
    if (links.length === 0) {
      return NextResponse.json({ error: "No linked manager found for this vendor account." }, { status: 400 });
    }
    const target = body.managerUserId
      ? links.find((l) => l.managerUserId === body.managerUserId)
      : links[0];
    if (!target) {
      return NextResponse.json({ error: "You are not linked to that manager." }, { status: 403 });
    }

    const lineItems = normalizeLineItems(body.lineItems);
    if (lineItems.length === 0) {
      return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
    }
    const subtotalCents = sumLineItemsCents(lineItems);
    const taxCents = Math.max(0, Math.round(Number(body.taxCents ?? 0) || 0));
    const totalCents = subtotalCents + taxCents;

    const now = new Date().toISOString();
    const { data, error } = await db
      .from("vendor_invoices")
      .insert({
        manager_user_id: target.managerUserId,
        vendor_user_id: userId,
        vendor_id: target.id,
        work_order_id: body.workOrderId?.trim() || null,
        invoice_number: body.invoiceNumber?.trim() || null,
        line_items: lineItems,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        status: "submitted",
        memo: body.memo?.trim() || null,
        submitted_at: now,
        updated_at: now,
      })
      .select(VENDOR_INVOICE_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Server-confirmed outcome — fire only after the row is written.
    track("vendor_invoice_submitted", userId, {
      invoice_id: data.id as string,
      total_cents: totalCents,
      line_items: lineItems.length,
      has_work_order: Boolean(body.workOrderId?.trim()),
    });

    return NextResponse.json({ invoice: mapVendorInvoiceRow(data) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to submit invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
