import { NextResponse } from "next/server";
import { stripePriceIdForPaidTier } from "@/lib/stripe-price-ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

type Body = {
  tier?: string;
  billing?: string;
  /** `/manager` or `/owner` — success/cancel URLs under this base. */
  returnBasePath?: string;
};

function isPaidTier(s: string): s is "pro" | "business" {
  return s === "pro" || s === "business";
}

function isBilling(s: string): s is "monthly" | "annual" {
  return s === "monthly" || s === "annual";
}

/**
 * Authenticated Stripe Checkout for upgrading an existing manager/owner from Free (or non-Stripe billing)
 * to Pro or Business. Links the subscription to `profiles` via metadata `userId` for webhook upsert.
 */
export async function POST(req: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const tierRaw = typeof body?.tier === "string" ? body.tier.toLowerCase().trim() : "";
    const billingRaw = typeof body?.billing === "string" ? body.billing.toLowerCase().trim() : "";
    const baseRaw = typeof body?.returnBasePath === "string" ? body.returnBasePath.trim() : "/manager";

    if (!isPaidTier(tierRaw) || !isBilling(billingRaw)) {
      return NextResponse.json({ error: "tier must be pro or business; billing must be monthly or annual." }, { status: 400 });
    }

    const tier = tierRaw;
    const billing = billingRaw;

    const price = stripePriceIdForPaidTier(tier, billing)?.trim();
    if (!price) {
      return NextResponse.json(
        {
          error: `Missing Stripe price for ${tier} ${billing}. Set STRIPE_PRICE_* env vars.`,
        },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Set NEXT_PUBLIC_APP_URL to your site origin (no trailing slash)." }, { status: 500 });
    }

    const basePath = baseRaw === "/owner" ? "/owner" : "/manager";

    const { data: profile, error: profileErr } = await supabaseAuth
      .from("profiles")
      .select("email, manager_id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
    const managerId = profile?.manager_id?.trim();
    if (!email?.includes("@")) {
      return NextResponse.json({ error: "Your account needs an email before subscribing." }, { status: 400 });
    }
    if (!managerId) {
      return NextResponse.json({ error: "Your profile is missing an Axis ID. Contact support." }, { status: 400 });
    }

    const stripe = getStripe();

    const metadata: Record<string, string> = {
      tier,
      billing,
      manager_id: managerId,
      email,
      userId: user.id,
    };
    const fn = profile?.full_name?.trim();
    if (fn) metadata.full_name = fn;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "hosted_page",
      line_items: [{ price, quantity: 1 }],
      customer_email: email,
      client_reference_id: user.id,
      metadata,
      success_url: `${appUrl}${basePath}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${basePath}/plan?checkout=cancelled`,
      allow_promotion_codes: tier === "pro" && billing === "monthly",
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
