import { NextResponse } from "next/server";
import { generateManagerId } from "@/lib/manager-id";
import { newAxisIntentSessionId } from "@/lib/manager-signup-intent";
import { createManagerCheckoutSession } from "@/lib/stripe/manager-checkout";
import { normalizeOnboardDiscountPercent } from "@/lib/stripe-onboard-discount";
import { getStripe } from "@/lib/stripe";
import { getPaymentWaiverCode } from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Tier = "free" | "pro" | "business";
type Billing = "monthly" | "annual";

type Body = {
  tier?: string;
  billing?: string;
  promo?: string;
  discountPercent?: number;
  phone?: string;
};

function isTier(s: string): s is Tier {
  return s === "free" || s === "pro" || s === "business";
}

function isBilling(s: string): s is Billing {
  return s === "monthly" || s === "annual";
}

function oauthFullName(meta: Record<string, unknown> | null | undefined): string {
  const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta?.name === "string" ? meta.name.trim() : "";
  return name;
}

/**
 * After Google sign-in on partner pricing: create free intent or Stripe checkout
 * using the authenticated user's Google email/name (no manual form required).
 */
export async function POST(req: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const tierRaw = typeof body.tier === "string" ? body.tier.toLowerCase().trim() : "";
    const billingRaw = typeof body.billing === "string" ? body.billing.toLowerCase().trim() : "";
    const promo = typeof body.promo === "string" ? body.promo.trim().toUpperCase() : "";
    const onboardDiscount = normalizeOnboardDiscountPercent(body.discountPercent);
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (!tierRaw || !billingRaw || !isTier(tierRaw) || !isBilling(billingRaw)) {
      return NextResponse.json({ error: "tier and billing are required." }, { status: 400 });
    }

    const email = user.email.trim().toLowerCase();
    const fullName = oauthFullName(user.user_metadata);

    const supabase = createSupabaseServiceRoleClient();
    const { data: purchasesForEmail } = await supabase.from("manager_purchases").select("user_id").eq("email", email);
    if (purchasesForEmail?.some((r) => r.user_id != null)) {
      return NextResponse.json(
        { error: "A manager account already exists for this email. Sign in instead." },
        { status: 409 },
      );
    }

    const waiverCode = getPaymentWaiverCode();
    const skipStripeForFree = tierRaw === "free";
    const skipStripeForPromo = waiverCode != null && promo === waiverCode.trim().toUpperCase();
    const skipStripeForOnboardOffer = tierRaw !== "free" && onboardDiscount === 100;

    if (skipStripeForFree || skipStripeForPromo || skipStripeForOnboardOffer) {
      const sessionId = newAxisIntentSessionId();
      const managerId = generateManagerId();

      const { error: insErr } = await supabase.from("manager_purchases").insert({
        stripe_checkout_session_id: sessionId,
        email,
        manager_id: managerId,
        tier: tierRaw,
        billing: billingRaw,
        promo_code: skipStripeForPromo
          ? promo
          : skipStripeForOnboardOffer
            ? `ONBOARD_FREE_${tierRaw.toUpperCase()}`
            : null,
        paid_at: new Date().toISOString(),
        full_name: fullName || null,
      });

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      return NextResponse.json({ action: "finish", sessionId });
    }

    const checkout = await createManagerCheckoutSession({
      tier: tierRaw,
      billing: billingRaw,
      email,
      fullName,
      phone,
      userId: user.id,
      promo,
      discountPercent: onboardDiscount ?? undefined,
      embedded: false,
      req,
    });

    if (!checkout.ok) {
      return NextResponse.json({ error: checkout.error, code: checkout.code }, { status: checkout.status });
    }

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
      const managerId = session.metadata?.manager_id?.trim();
      if (managerId) {
        const { error: reserveErr } = await supabase.from("manager_purchases").upsert(
          {
            stripe_checkout_session_id: checkout.sessionId,
            email,
            manager_id: managerId,
            tier: tierRaw,
            billing: billingRaw,
            full_name: fullName || null,
          },
          { onConflict: "manager_id" },
        );
        if (reserveErr) {
          return NextResponse.json({ error: reserveErr.message }, { status: 500 });
        }
      }
    } catch (reserveError) {
      const message = reserveError instanceof Error ? reserveError.message : "Could not reserve signup.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (checkout.embedded) {
      return NextResponse.json({
        action: "checkout",
        clientSecret: checkout.clientSecret,
        sessionId: checkout.sessionId,
      });
    }

    return NextResponse.json({ action: "redirect", url: checkout.url, sessionId: checkout.sessionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not continue signup.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
