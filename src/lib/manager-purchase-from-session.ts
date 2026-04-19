import type Stripe from "stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/** Idempotent: records a completed Checkout session as a paid manager purchase. */
export async function recordPaidManagerCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const managerId = session.metadata?.manager_id?.trim();
  const email = (
    session.customer_details?.email ??
    session.customer_email ??
    session.metadata?.email
  )
    ?.trim()
    .toLowerCase();
  if (!managerId || !email) return;

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";
  if (!paid) return;

  const supabase = createSupabaseServiceRoleClient();
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer && typeof session.customer !== "string"
        ? session.customer.id
        : null;

  const { error } = await supabase.from("manager_purchases").upsert(
    {
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customerId,
      email,
      manager_id: managerId,
      tier: session.metadata?.tier ?? null,
      billing: session.metadata?.billing ?? null,
      promo_code: session.metadata?.promo ?? null,
      paid_at: new Date().toISOString(),
      full_name: session.metadata?.full_name?.trim() || null,
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  if (error) throw new Error(error.message);
}
