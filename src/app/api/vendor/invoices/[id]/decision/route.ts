import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { track } from "@/lib/analytics/posthog";
import { mapVendorInvoiceRow, VENDOR_INVOICE_SELECT, type VendorInvoiceStatus } from "@/lib/vendor-invoices";
import { createBillFromVendorInvoice } from "@/lib/manager-bills.server";

export const runtime = "nodejs";

// Which target statuses a manager may set from the review UI, and the PostHog
// event each transition emits (paid/scheduled are lifecycle-only, no event yet).
const MANAGER_DECISIONS: Partial<Record<VendorInvoiceStatus, string | null>> = {
  approved: "vendor_invoice_approved",
  rejected: "vendor_invoice_rejected",
  scheduled: "vendor_invoice_approved",
  paid: null,
};

/** Manager approves / rejects / schedules / marks paid an invoice billed to them. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as { status?: string; decisionNote?: string };
    const status = body.status as VendorInvoiceStatus | undefined;
    if (!status || !(status in MANAGER_DECISIONS)) {
      return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    }

    // Scope strictly to invoices billed to this manager — never trust the id alone.
    const { data: existing, error: readError } = await auth.db
      .from("vendor_invoices")
      .select("id, status, vendor_user_id, total_cents")
      .eq("id", id)
      .eq("manager_user_id", auth.userId)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      decision_note: body.decisionNote?.trim() || null,
      decided_at: now,
      decided_by: auth.userId,
      updated_at: now,
    };
    if (status === "paid") patch.paid_at = now;

    const { data, error } = await auth.db
      .from("vendor_invoices")
      .update(patch)
      .eq("id", id)
      .eq("manager_user_id", auth.userId)
      .select(VENDOR_INVOICE_SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const event = MANAGER_DECISIONS[status];
    if (event) {
      // Attribute the event to the vendor whose invoice moved (server-confirmed).
      track(event, existing.vendor_user_id as string, {
        invoice_id: id,
        status,
        total_cents: existing.total_cents as number,
      });
    }

    if (status === "approved") {
      await createBillFromVendorInvoice(auth.db, auth.userId, id).catch(() => undefined);
    }

    return NextResponse.json({ invoice: mapVendorInvoiceRow(data) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
