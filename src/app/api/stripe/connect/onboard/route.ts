import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates or resumes Stripe Connect Express onboarding for the signed-in user.
 * - New user: create Express account, store `stripe_connect_account_id` on `profiles`, then Account Link.
 * - Existing: Account Link (onboarding / update) or Express Login Link if fully enabled.
 * Without STRIPE_SECRET_KEY, returns a demo payload instead of throwing.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { basePath?: string };
    const raw = body.basePath?.trim();
    const basePath =
      raw === "/owner" ? "/owner" : raw === "/pro" ? "/pro" : "/manager";

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const origin = host ? `${proto}://${host}` : "http://localhost:3000";

    const refreshUrl = `${origin}${basePath}/payments?connect=refresh`;
    const returnUrl = `${origin}${basePath}/payments?connect=done`;

    try {
      const stripe = getStripe();

      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id")
        .eq("id", user.id)
        .maybeSingle();

      let accountId = profile?.stripe_connect_account_id?.trim() ?? null;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          country: "US",
          email: user.email ?? undefined,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: {
            axis_user_id: user.id,
            axis_portal: basePath === "/owner" ? "owner" : basePath === "/pro" ? "pro" : "manager",
          },
        });
        accountId = account.id;
        await supabase
          .from("profiles")
          .update({
            stripe_connect_account_id: accountId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }

      const acct = await stripe.accounts.retrieve(accountId);

      const readyForPayouts = Boolean(acct.charges_enabled && acct.payouts_enabled);

      if (readyForPayouts) {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        return NextResponse.json({
          url: loginLink.url,
          accountId,
          mode: "express_dashboard" as const,
        });
      }

      const linkType = acct.details_submitted ? "account_update" : "account_onboarding";
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: linkType,
      });

      return NextResponse.json({
        url: accountLink.url,
        accountId,
        mode: linkType === "account_onboarding" ? ("onboarding" as const) : ("update" as const),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe error";
      if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("Missing STRIPE")) {
        return NextResponse.json({
          demo: true,
          message:
            "Stripe is not configured (missing STRIPE_SECRET_KEY). Add keys in your environment to enable live Connect onboarding.",
        });
      }
      if (msg.includes("signed up for Connect")) {
        return NextResponse.json(
          {
            error:
              "Stripe Connect is not activated for your platform account yet. In the Stripe Dashboard, open Connect and complete setup (Get started): https://dashboard.stripe.com/connect/account/onboarding — then return here and try again.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({
        demo: true,
        message: `Stripe Connect could not start: ${msg}. Check API version and Connect settings in Stripe Dashboard.`,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
