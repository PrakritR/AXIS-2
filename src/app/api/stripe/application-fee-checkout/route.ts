import { NextResponse } from "next/server";
import { getManagerPurchaseSku } from "@/lib/manager-access";
import { platformFeeCents } from "@/lib/platform-fees";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const PURPOSE = "rental_application_fee";

type Body = {
  propertyId?: string;
  residentEmail?: string;
  residentName?: string;
  /** Gross amount in USD cents (integer). */
  amountCents?: number;
  /** Listing owner Supabase user id (matches `profiles.id` / `MockProperty.managerUserId`). */
  managerUserId?: string;
};

function clampAmountCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const x = Math.round(n);
  /** $1 .. $1000 */
  if (x < 100 || x > 100_000) return 0;
  return x;
}

/**
 * Creates a Stripe Checkout Session (payment mode) with Connect destination charges:
 * funds go to the listing manager’s connected account; Axis takes a platform fee by tier.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const residentEmail = typeof body.residentEmail === "string" ? body.residentEmail.trim() : "";
    const residentName = typeof body.residentName === "string" ? body.residentName.trim() : "";
    const managerUserId = typeof body.managerUserId === "string" ? body.managerUserId.trim() : "";
    const amountCents = clampAmountCents(typeof body.amountCents === "number" ? body.amountCents : NaN);

    if (!propertyId || !residentEmail.includes("@") || !managerUserId) {
      return NextResponse.json({ error: "propertyId, residentEmail, and managerUserId are required." }, { status: 400 });
    }
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Invalid amount (must be between $1.00 and $1000.00)." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Set NEXT_PUBLIC_APP_URL to your site origin (no trailing slash)." }, { status: 500 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", managerUserId)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const destination =
      (profile as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id?.trim() ?? "";

    if (!destination) {
      return NextResponse.json(
        {
          code: "MANAGER_NO_CONNECT_ACCOUNT",
          error:
            "This property manager has not connected Stripe payouts yet. Use Zelle for the application fee if the listing offers it, or contact the manager.",
        },
        { status: 422 },
      );
    }

    const { tier } = await getManagerPurchaseSku(managerUserId);
    const applicationFeeAmount = platformFeeCents(amountCents, "application_fee", tier);
    if (applicationFeeAmount > 0 && applicationFeeAmount >= amountCents) {
      return NextResponse.json(
        { error: "Platform fee configuration prevents this charge; contact Axis support." },
        { status: 500 },
      );
    }

    const stripe = getStripe();

    const metadata: Record<string, string> = {
      purpose: PURPOSE,
      property_id: propertyId.slice(0, 450),
      resident_email: residentEmail.toLowerCase().slice(0, 450),
      manager_user_id: managerUserId,
    };
    if (residentName) metadata.resident_name = residentName.slice(0, 450);

    const paymentIntentData: {
      transfer_data: { destination: string };
      metadata: Record<string, string>;
      application_fee_amount?: number;
    } = {
      transfer_data: { destination },
      metadata,
    };
    if (applicationFeeAmount > 0) {
      paymentIntentData.application_fee_amount = applicationFeeAmount;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: residentEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Rental application fee",
              description: `Listing ${propertyId.slice(0, 120)}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: paymentIntentData,
      success_url: `${appUrl}/rent/apply?fee_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/rent/apply?fee_checkout=cancel`,
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    if (message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE")) {
      return NextResponse.json(
        { code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured on the server (missing STRIPE_SECRET_KEY)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
