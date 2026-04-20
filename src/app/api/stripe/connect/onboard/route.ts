import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Starts Stripe Connect Express onboarding for the signed-in user (manager or owner).
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
    const basePath = body.basePath === "/owner" ? "/owner" : "/manager";

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    const origin = host ? `${proto}://${host}` : "http://localhost:3000";

    try {
      const stripe = getStripe();
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { axis_user_id: user.id, axis_portal: basePath === "/owner" ? "owner" : "manager" },
      });

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${origin}${basePath}/stripe?connect=refresh`,
        return_url: `${origin}${basePath}/stripe?connect=done`,
        type: "account_onboarding",
      });

      return NextResponse.json({ url: accountLink.url, accountId: account.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe error";
      if (msg.includes("STRIPE_SECRET_KEY") || msg.includes("Missing STRIPE")) {
        return NextResponse.json({
          demo: true,
          message:
            "Stripe is not configured (missing STRIPE_SECRET_KEY). Add keys in your environment to enable live Connect onboarding.",
        });
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
