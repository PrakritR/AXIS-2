import { NextResponse } from "next/server";
import { createApplicationFeeCheckout } from "@/lib/application-fee-checkout.server";
import { resolveAppOrigin } from "@/lib/app-url";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { stripeNotConfiguredError } from "@/lib/stripe-axis-ach-checkout";

export const runtime = "nodejs";

type Body = {
  propertyId?: string;
  residentEmail?: string;
  residentName?: string;
  /** Listing owner Supabase user id (matches `profiles.id` / `MockProperty.managerUserId`). */
  managerUserId?: string;
  /** Checkout return path (defaults to public apply). Must start with `/`. */
  returnPath?: string;
  /** True once a manager waiver code has already been redeemed for this fee. */
  feeWaived?: boolean;
};

/**
 * Creates a Stripe Checkout Session (card / Apple Pay / Google Pay) with
 * Connect destination charges for the rental application fee, and — only on
 * listings where the manager opted `holdingDepositTiming` into
 * "at_application" — the holding deposit combined into the SAME session as a
 * second line item (see `createApplicationFeeCheckout`). On the default
 * "after_approval" listings the deposit is never collected here; it is
 * charged under Payments after approval. A fee fully waived by a manager
 * waiver code with no deposit due never reaches this route at all (nothing
 * to charge) — see `/api/public/application-fee-waiver`.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`application-fee-checkout:${clientIpFrom(req)}`, 20, 60_000).ok) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
    }

    const body = (await req.json()) as Body;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const residentEmail = typeof body.residentEmail === "string" ? body.residentEmail.trim() : "";
    const residentName = typeof body.residentName === "string" ? body.residentName.trim() : "";
    const managerUserId = typeof body.managerUserId === "string" ? body.managerUserId.trim() : "";

    if (!propertyId || !residentEmail.includes("@") || !managerUserId) {
      return NextResponse.json({ error: "propertyId, residentEmail, and managerUserId are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const stripe = getStripe();
    const appUrl = resolveAppOrigin(req);
    const returnPath =
      typeof body.returnPath === "string" && body.returnPath.startsWith("/")
        ? body.returnPath.split("?")[0] ?? "/rent/apply"
        : "/rent/apply";

    const result = await createApplicationFeeCheckout(db, stripe, {
      propertyId,
      residentEmail,
      residentName: residentName || undefined,
      managerUserId,
      feeWaived: body.feeWaived === true,
      successUrl: `${appUrl}${returnPath}?fee_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${returnPath}?fee_checkout=cancel`,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      // Itemized so the caller can show "application fee + service fee = total"
      // before redirecting — never a surprise amount on Stripe's page.
      applicationFeeCents: result.itemization.applicationFeeCents,
      holdingDepositCents: result.itemization.holdingDepositCents,
      serviceFeeCents: result.itemization.serviceFeeCents,
      totalCents: result.itemization.totalCents,
      platformFeeCents: 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    if (stripeNotConfiguredError(message)) {
      return NextResponse.json(
        { code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured on the server (missing STRIPE_SECRET_KEY)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
