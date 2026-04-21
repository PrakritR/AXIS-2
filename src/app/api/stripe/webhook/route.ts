import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  reconcileManagerPurchaseByStripeSubscriptionId,
  reconcileManagerPurchaseWithStripe,
} from "@/lib/manager-stripe-subscription-sync";
import { recordPaidManagerCheckoutSession } from "@/lib/manager-purchase-from-session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function logCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customer = session.customer;
  const subscription = session.subscription;

  const customerId = typeof customer === "string" ? customer : customer?.id ?? null;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id ?? null;

  const tier = session.metadata?.tier ?? null;
  const billing = session.metadata?.billing ?? null;
  const userId = session.metadata?.userId ?? null;

  // eslint-disable-next-line no-console -- intentional webhook audit log
  console.info("[stripe webhook] checkout.session.completed", {
    sessionId: session.id,
    customerId,
    subscriptionId,
    tier,
    billing,
    userId,
  });

}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      // eslint-disable-next-line no-console -- Connect observability
      console.info("[stripe webhook] account.updated", {
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      });
      /* Optional: upsert payout readiness into Supabase (e.g. profiles) using service role. */
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      logCheckoutCompleted(session);
      try {
        await recordPaidManagerCheckoutSession(session);
        const uid = session.metadata?.userId?.trim();
        if (uid) {
          try {
            await reconcileManagerPurchaseWithStripe(uid);
          } catch (reconcileErr) {
            // eslint-disable-next-line no-console -- webhook persistence
            console.error("[stripe webhook] reconcileManagerPurchaseWithStripe", reconcileErr);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console -- webhook persistence
        console.error("[stripe webhook] recordPaidManagerCheckoutSession", e);
      }
    }
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      try {
        if (event.type === "customer.subscription.deleted") {
          const supabase = createSupabaseServiceRoleClient();
          await supabase
            .from("manager_purchases")
            .update({ tier: "free", billing: "free", stripe_subscription_id: null })
            .eq("stripe_subscription_id", sub.id);
        } else {
          await reconcileManagerPurchaseByStripeSubscriptionId(sub.id);
        }
      } catch (e) {
        // eslint-disable-next-line no-console -- webhook persistence
        console.error("[stripe webhook] subscription event", e);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
