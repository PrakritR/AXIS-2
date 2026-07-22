import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { axisAchCheckoutPaid, axisAchCheckoutProcessing } from "@/lib/stripe-axis-ach-checkout";
import { isApplicationFeeCheckoutSession, markApplicationFeePaidFromStripeSession } from "@/lib/stripe-application-fee";

export const runtime = "nodejs";

function normalizedEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

type Body = {
  sessionId?: string;
  expectedEmail?: string;
};

/**
 * Confirms a completed Checkout Session for `rental_application_fee` (ACH return URL flow).
 *
 * The caller POSTs the email it believes bought the session and gets back only
 * `emailMatches`. This endpoint is unauthenticated, so the applicant's address
 * is never echoed in the response — and it travels in the request BODY rather
 * than the query string, which CDN/proxy/APM access logs record verbatim.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const expectedEmail = normalizedEmail(body.expectedEmail);
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!isApplicationFeeCheckoutSession(session)) {
      return NextResponse.json({ error: "Not an application fee checkout session." }, { status: 400 });
    }

    const paid = axisAchCheckoutPaid(session);
    const processing = axisAchCheckoutProcessing(session);

    if (!paid && !processing) {
      return NextResponse.json(
        {
          paid: false,
          processing: false,
          paymentStatus: session.payment_status,
          status: session.status,
          error: "Payment is not completed yet. Wait a moment and try again.",
        },
        { status: 200 },
      );
    }

    let chargeId: string | null = null;
    let alreadyPaid = false;
    if (paid) {
      const db = createSupabaseServiceRoleClient();
      const result = await markApplicationFeePaidFromStripeSession(db, session);
      chargeId = result.chargeId ?? null;
      alreadyPaid = result.alreadyPaid ?? false;
    }

    return NextResponse.json({
      paid,
      processing,
      paymentStatus: session.payment_status,
      sessionId: session.id,
      propertyId: session.metadata?.property_id ?? null,
      emailMatches:
        expectedEmail.length > 0 &&
        expectedEmail === normalizedEmail(session.metadata?.resident_email ?? session.customer_email),
      chargeId,
      alreadyPaid,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to verify session";
    if (message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE")) {
      return NextResponse.json({ error: "Stripe is not configured on the server." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
