import { NextResponse } from "next/server";
import { generateManagerId } from "@/lib/manager-id";
import { PRO_MONTHLY_FIRST_FREE_PROMO_CODE } from "@/lib/stripe-promos";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type Tier = "pro" | "business";
type Billing = "monthly" | "annual";

type Body = {
  tier?: string;
  billing?: string;
  email?: string;
  userId?: string;
  /** Optional; if set to FREEFIRST, checkout must be Pro monthly. */
  promo?: string;
  /**
   * When true (default), returns `clientSecret` for Embedded Checkout on the same page.
   * When false, returns hosted `url` (full-page redirect to Stripe).
   */
  embedded?: boolean;
};

function priceIdFor(tier: Tier, billing: Billing): string | undefined {
  if (tier === "pro") {
    return billing === "annual" ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO_MONTHLY;
  }
  if (tier === "business") {
    return billing === "annual" ? process.env.STRIPE_PRICE_BUSINESS_ANNUAL : process.env.STRIPE_PRICE_BUSINESS_MONTHLY;
  }
  return undefined;
}

function isTier(s: string): s is Tier {
  return s === "pro" || s === "business";
}

function isBilling(s: string): s is Billing {
  return s === "monthly" || s === "annual";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const tierRaw = typeof body.tier === "string" ? body.tier.toLowerCase().trim() : "";
    const billingRaw = typeof body.billing === "string" ? body.billing.toLowerCase().trim() : "";
    const useEmbedded = body.embedded !== false;

    if (!tierRaw || !billingRaw) {
      return NextResponse.json({ error: "tier and billing are required." }, { status: 400 });
    }
    if (!isTier(tierRaw)) {
      return NextResponse.json({ error: "tier must be \"pro\" or \"business\"." }, { status: 400 });
    }
    if (!isBilling(billingRaw)) {
      return NextResponse.json({ error: "billing must be \"monthly\" or \"annual\"." }, { status: 400 });
    }

    const tier = tierRaw;
    const billing = billingRaw;

    const price = priceIdFor(tier, billing)?.trim();
    if (!price) {
      return NextResponse.json(
        {
          error: `Missing Stripe price for ${tier} ${billing}. Set STRIPE_PRICE_${tier.toUpperCase()}_${billing === "annual" ? "ANNUAL" : "MONTHLY"}.`,
        },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Set NEXT_PUBLIC_APP_URL to your site origin (no trailing slash)." }, { status: 500 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const promoRaw = typeof body.promo === "string" ? body.promo.trim() : "";
    const promoUpper = promoRaw.toUpperCase();

    const isProMonthly = tier === "pro" && billing === "monthly";
    if (promoUpper === PRO_MONTHLY_FIRST_FREE_PROMO_CODE && !isProMonthly) {
      return NextResponse.json(
        { error: `Promo ${PRO_MONTHLY_FIRST_FREE_PROMO_CODE} applies only to Pro monthly billing.` },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    const metadata: Record<string, string> = {
      tier,
      billing,
      manager_id: generateManagerId(),
    };
    if (userId) metadata.userId = userId;
    if (promoRaw) metadata.promo = promoRaw;

    /** Stripe Checkout promo field; only offered when Pro monthly so other plans cannot use FREEFIRST at checkout. */
    const allowPromotionCodes = isProMonthly;

    if (useEmbedded) {
      /** `ui_mode: embedded` is valid in Stripe API; SDK types may lag. */
      const session = await stripe.checkout.sessions.create({
        ui_mode: "embedded",
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        return_url: `${appUrl}/partner/pricing?session_id={CHECKOUT_SESSION_ID}`,
        ...(email ? { customer_email: email } : {}),
        ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
        metadata,
      } as unknown as Parameters<typeof stripe.checkout.sessions.create>[0]);

      const clientSecret = session.client_secret;
      if (!clientSecret) {
        return NextResponse.json({ error: "Stripe did not return a client secret for embedded checkout." }, { status: 500 });
      }

      return NextResponse.json({
        clientSecret,
        sessionId: session.id,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(email ? { customer_email: email } : {}),
      ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      metadata,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
