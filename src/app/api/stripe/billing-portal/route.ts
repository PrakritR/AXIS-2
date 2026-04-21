import { NextResponse } from "next/server";
import { getManagerPurchaseSku } from "@/lib/manager-access";
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

    const { stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: "No Stripe subscription on file." }, { status: 400 });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customerId) {
      return NextResponse.json({ error: "Subscription has no customer." }, { status: 500 });
    }

    const origin = new URL(req.url).origin;
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
