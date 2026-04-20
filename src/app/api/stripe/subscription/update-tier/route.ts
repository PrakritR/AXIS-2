import { NextResponse } from "next/server";
import { getManagerPurchaseSku, setManagerPurchaseTier, type ManagerSkuTier } from "@/lib/manager-access";
import {
  inferBillingFromStripePriceId,
  stripePriceIdForPaidTier,
  type PaidTier,
  type StripeBilling,
} from "@/lib/stripe-price-ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function isSku(s: string): s is ManagerSkuTier {
  return s === "free" || s === "pro" || s === "business";
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { tier?: string } | null;
    const tierRaw = typeof body?.tier === "string" ? body.tier.toLowerCase().trim() : "";
    if (!isSku(tierRaw)) {
      return NextResponse.json({ error: "tier must be free, pro, or business." }, { status: 400 });
    }

    const targetTier = tierRaw;
    const { stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
    const supabase = createSupabaseServiceRoleClient();

    if (!stripeSubscriptionId) {
      const result = await setManagerPurchaseTier(user.id, targetTier);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, stripeManaged: false, tier: targetTier });
    }

    const stripe = getStripe();

    if (targetTier === "free") {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      const { error } = await supabase
        .from("manager_purchases")
        .update({ tier: "free", billing: "free", stripe_subscription_id: null })
        .eq("user_id", user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, stripeManaged: false, tier: "free" });
    }

    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item?.id) {
      return NextResponse.json({ error: "Subscription has no line item." }, { status: 500 });
    }

    const currentPriceId = typeof item.price === "string" ? item.price : item.price?.id;
    const billingGuess = inferBillingFromStripePriceId(currentPriceId) ?? "monthly";
    const billing: StripeBilling = billingGuess === "annual" ? "annual" : "monthly";

    const targetPaid: PaidTier = targetTier === "business" ? "business" : "pro";
    const newPriceId = stripePriceIdForPaidTier(targetPaid, billing)?.trim();
    if (!newPriceId) {
      return NextResponse.json(
        {
          error: `Missing Stripe price for ${targetPaid} ${billing}. Set STRIPE_PRICE_* env vars.`,
        },
        { status: 500 },
      );
    }

    if (currentPriceId === newPriceId) {
      await supabase.from("manager_purchases").update({ tier: targetPaid, billing }).eq("user_id", user.id);
      return NextResponse.json({ ok: true, stripeManaged: true, tier: targetPaid, billing });
    }

    await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    });

    const { error: upErr } = await supabase
      .from("manager_purchases")
      .update({ tier: targetPaid, billing })
      .eq("user_id", user.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, stripeManaged: true, tier: targetPaid, billing });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
