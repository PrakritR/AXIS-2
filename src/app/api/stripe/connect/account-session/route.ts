import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createAxisConnectAccount, ensureConnectAccountTransfersRequested } from "@/lib/stripe-connect";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const stripe = getStripe();
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id")
        .eq("id", user.id)
        .maybeSingle();

      let accountId = profile?.stripe_connect_account_id?.trim() ?? null;

      if (!accountId) {
        const account = await createAxisConnectAccount(stripe, {
          email: user.email ?? undefined,
          axisUserId: user.id,
        });
        accountId = account.id;
        await supabase
          .from("profiles")
          .update({
            stripe_connect_account_id: accountId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      } else {
        await ensureConnectAccountTransfersRequested(stripe, accountId);
      }

      const session = await stripe.accountSessions.create({
        account: accountId,
        components: {
          account_onboarding: { enabled: true },
          account_management: { enabled: true },
          balances: { enabled: true },
          payouts: { enabled: true },
          payouts_list: { enabled: true },
        },
      });

      return NextResponse.json({
        clientSecret: session.client_secret,
        accountId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe error";
      if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("Missing STRIPE")) {
        return NextResponse.json({
          demo: true,
          message:
            "Stripe is not configured (missing STRIPE_SECRET_KEY). Add keys in your environment to enable live embedded payout setup.",
        });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
