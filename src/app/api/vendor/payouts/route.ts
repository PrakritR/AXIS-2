import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Returns the signed-in vendor's own payout history, most recent first. */
export async function GET() {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (String(profile?.role ?? "").toLowerCase() !== "vendor") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await db
      .from("vendor_payouts")
      .select("id, work_order_id, amount_cents, stripe_transfer_id, status, failure_reason, created_at")
      .eq("vendor_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const payouts = (data ?? []).map((row) => ({
      id: row.id as string,
      workOrderId: row.work_order_id as string,
      amountCents: row.amount_cents as number,
      stripeTransferId: (row.stripe_transfer_id as string | null) ?? null,
      status: row.status as "paid" | "failed" | "skipped",
      failureReason: (row.failure_reason as string | null) ?? null,
      createdAt: row.created_at as string,
    }));

    return NextResponse.json({ payouts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payouts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
