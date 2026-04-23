import { NextResponse } from "next/server";
import { resolveAppOrigin } from "@/lib/app-url";
import { generateManagerId } from "@/lib/manager-id";
import { normalizeProMonthlyPromoInput, PRO_MONTHLY_FIRST_FREE_PROMO_CODE } from "@/lib/stripe-promos";
import { stripePriceIdForPaidTier } from "@/lib/stripe-price-ids";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type Tier = "pro" | "business";
type Billing = "monthly" | "annual";

type Body = {
  tier?: string;
  billing?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  userId?: string;
  /** Optional; if set to FREEFIRST (or alias), checkout must be Pro monthly. */
  promo?: string;
  embedded?: boolean;
};

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

    const price = stripePriceIdForPaidTier(tier, billing)?.trim();
    if (!price) {
      return NextResponse.json(
        {
          error: `Missing Stripe price for ${tier} ${billing}. Set STRIPE_PRICE_${tier.toUpperCase()}_${billing === "annual" ? "ANNUAL" : "MONTHLY"}.`,
        },
        { status: 500 },
      );
    }

    const appUrl = resolveAppOrigin(req);

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const promoRaw = typeof body.promo === "string" ? normalizeProMonthlyPromoInput(body.promo) : "";
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
    if (email) metadata.email = email;
    if (fullName) metadata.full_name = fullName;
    if (phone) metadata.phone = phone;
    if (userId) metadata.userId = userId;
    if (promoRaw) metadata.promo = promoRaw;

    /** Auto-apply first-month-free when configured (Dashboard promotion code id: promo_…). */
    const promoCodeId = process.env.STRIPE_PROMOTION_CODE_ID_FIRST_MONTH_FREE?.trim();
    const autoFirstMonthFree =
      isProMonthly && promoUpper === PRO_MONTHLY_FIRST_FREE_PROMO_CODE && Boolean(promoCodeId);

    /** Let customers enter other codes at Checkout when not auto-applying FREEFIRST. */
    const allowPromotionCodes = isProMonthly && !autoFirstMonthFree;

    const sessionBase = {
      mode: "subscription" as const,
      line_items: [{ price, quantity: 1 }],
      ...(email ? { customer_email: email } : {}),
      metadata,
      ...(autoFirstMonthFree && promoCodeId ? { discounts: [{ promotion_code: promoCodeId }] } : {}),
      ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
    };

    if (useEmbedded) {
      const session = await stripe.checkout.sessions.create({
        ui_mode: "embedded_page",
        ...sessionBase,
        return_url: `${appUrl}/auth/manager-id?session_id={CHECKOUT_SESSION_ID}`,
      } as Parameters<typeof stripe.checkout.sessions.create>[0]);

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
      ui_mode: "hosted_page",
      ...sessionBase,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
