import { NextResponse } from "next/server";
import { getManagerPurchaseSku } from "@/lib/manager-access";
import { resolveAppOrigin } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function allowedReturnPath(path: string | undefined): "/manager/plan" | "/owner/plan" | "/pro/plan" {
  const p = typeof path === "string" ? path.trim() : "";
  if (p.startsWith("/pro")) return "/pro/plan";
  if (p.startsWith("/owner")) return "/owner/plan";
  return "/manager/plan";
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { returnPath?: string };
    const returnPath = allowedReturnPath(body.returnPath);

    const { stripeCustomerId, stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
    const stripe = getStripe();
    let customerId = stripeCustomerId;
    if (!customerId && stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    }
    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer on file." }, { status: 400 });
    }

    const origin = resolveAppOrigin(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}${returnPath}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
