import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Returns Connect state for the signed-in user (Express dashboard vs onboarding).
 * Without Stripe keys, returns demo + profile row only if account id was stored.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", user.id)
      .maybeSingle();

    const accountId =
      (profile as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id?.trim() ?? null;

    if (!accountId?.trim()) {
      return NextResponse.json({
        connected: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      });
    }

    try {
      const stripe = getStripe();
      const acct = await stripe.accounts.retrieve(accountId);
      return NextResponse.json({
        connected: true,
        accountId: acct.id,
        chargesEnabled: Boolean(acct.charges_enabled),
        payoutsEnabled: Boolean(acct.payouts_enabled),
        detailsSubmitted: Boolean(acct.details_submitted),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe error";
      if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("Missing STRIPE")) {
        return NextResponse.json({
          demo: true,
          connected: Boolean(accountId),
          accountId,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          message:
            "Stripe is not configured on the server; cannot refresh Connect status. Keys present = live status.",
        });
      }
      return NextResponse.json({
        connected: true,
        accountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        stripeError: msg,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
