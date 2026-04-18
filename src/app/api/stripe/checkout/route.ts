import { NextResponse } from "next/server";
import { generateManagerId } from "@/lib/manager-id";
import { getStripe } from "@/lib/stripe/server";

type Body = {
  tierId: string;
  billing: string;
  email: string;
  fullName: string;
  phone?: string;
  promo?: string;
};

function priceIdFor(tierId: string, billing: string): string | undefined {
  const t = tierId.toLowerCase();
  const b = billing === "annual" ? "annual" : "monthly";
  const envKey = `STRIPE_PRICE_${t.toUpperCase()}_${b.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  const v = process.env[envKey];
  if (v) return v;
  const legacy = process.env[`STRIPE_PRICE_${t.toUpperCase()}`];
  return legacy;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { tierId, billing, email, fullName, phone, promo } = body;
    if (!email?.trim() || !fullName?.trim()) {
      return NextResponse.json({ error: "Email and full name are required." }, { status: 400 });
    }

    const price = priceIdFor(tierId, billing);
    if (!price) {
      return NextResponse.json(
        {
          error: `Missing Stripe price env. Set STRIPE_PRICE_${tierId.toUpperCase()}_${billing === "annual" ? "ANNUAL" : "MONTHLY"} (or STRIPE_PRICE_${tierId.toUpperCase()}).`,
        },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json({ error: "Set NEXT_PUBLIC_APP_URL to your site origin (e.g. https://axis.example)." }, { status: 500 });
    }

    const stripe = getStripe();
    const managerId = generateManagerId();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email.trim(),
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl}/auth/create-manager?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/partner/pricing`,
      metadata: {
        tier: tierId,
        billing,
        manager_id: managerId,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() ?? "",
        promo: promo?.trim() ?? "",
      },
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
