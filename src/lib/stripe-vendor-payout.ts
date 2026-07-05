import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { retrieveManagerConnectAccountOrNull, connectAccountTransfersActive } from "@/lib/stripe-connect";

/**
 * Best-effort Stripe Connect transfer of a vendor's share to their connected account when a
 * work order is approved + paid. Never throws — a Stripe failure (no account, not onboarded,
 * not configured, insufficient platform balance, etc.) is recorded as a "failed" vendor_payouts
 * row so the manager's approve-pay bookkeeping flow always succeeds regardless of payout outcome.
 * Idempotent: skips if a payout row already exists for this work order.
 */
export async function payoutVendorForWorkOrder(
  db: SupabaseClient,
  opts: { workOrderId: string; managerUserId: string; vendorUserId: string; amountCents: number },
): Promise<void> {
  if (!opts.amountCents || opts.amountCents <= 0) return;

  const { data: existingPayout } = await db
    .from("vendor_payouts")
    .select("id")
    .eq("work_order_id", opts.workOrderId)
    .maybeSingle();
  if (existingPayout) return;

  const { data: vendorProfile } = await db
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", opts.vendorUserId)
    .maybeSingle();
  const accountId = (vendorProfile as { stripe_connect_account_id?: string | null } | null)
    ?.stripe_connect_account_id?.trim();

  const insertPayout = (row: { status: "paid" | "failed"; stripeTransferId?: string; failureReason?: string }) =>
    db.from("vendor_payouts").insert({
      manager_user_id: opts.managerUserId,
      vendor_user_id: opts.vendorUserId,
      work_order_id: opts.workOrderId,
      amount_cents: opts.amountCents,
      stripe_transfer_id: row.stripeTransferId ?? null,
      status: row.status,
      failure_reason: row.failureReason ?? null,
    });

  if (!accountId) {
    await insertPayout({ status: "failed", failureReason: "Vendor has not connected a Stripe payout account yet." });
    return;
  }

  try {
    const stripe = getStripe();
    const account = await retrieveManagerConnectAccountOrNull(stripe, accountId);
    if (!account || !connectAccountTransfersActive(account)) {
      await insertPayout({
        status: "failed",
        failureReason: "Vendor's Stripe payout account has not finished onboarding.",
      });
      return;
    }

    const transfer = await stripe.transfers.create({
      amount: opts.amountCents,
      currency: "usd",
      destination: accountId,
      metadata: { work_order_id: opts.workOrderId, manager_user_id: opts.managerUserId },
    });
    await insertPayout({ status: "paid", stripeTransferId: transfer.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe transfer failed.";
    await insertPayout({ status: "failed", failureReason: message });
  }
}
