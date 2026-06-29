import { NextResponse } from "next/server";
import { getManagerPurchaseSku } from "@/lib/manager-access-server";
import { resolveAppOrigin } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { MANAGER_PLAN_PORTAL_PATH } from "@/lib/portals/manager-plan-path";

export const runtime = "nodejs";

function allowedReturnPath(path: string | undefined): typeof MANAGER_PLAN_PORTAL_PATH {
  void path;
  return MANAGER_PLAN_PORTAL_PATH;
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
