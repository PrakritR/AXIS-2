import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import {
  householdChargeCheckoutPaid,
  householdChargeCheckoutProcessing,
  isHouseholdChargeCheckoutSession,
  markHouseholdChargePaidFromStripeSession,
  markHouseholdChargeProcessingFromStripeSession,
} from "@/lib/stripe-household-charge";

export const runtime = "nodejs";

/**
 * Confirms a household charge Checkout Session after embedded or hosted ACH checkout.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!isHouseholdChargeCheckoutSession(session)) {
      return NextResponse.json({ error: "Not a household charge checkout session." }, { status: 400 });
    }

    const residentEmail = session.metadata?.resident_email?.trim().toLowerCase() ?? session.customer_email?.trim().toLowerCase() ?? "";
    const userEmail = (user.email ?? "").trim().toLowerCase();
    if (residentEmail && userEmail && residentEmail !== userEmail) {
      return NextResponse.json({ error: "This checkout session does not belong to your account." }, { status: 403 });
    }

    const paid = householdChargeCheckoutPaid(session);
    const processing = householdChargeCheckoutProcessing(session);

    if (!paid && !processing) {
      return NextResponse.json(
        {
          paid: false,
          processing: false,
          paymentStatus: session.payment_status,
          status: session.status,
          error: "Payment is not completed yet.",
        },
        { status: 200 },
      );
    }

    let chargeId: string | null = session.metadata?.charge_id?.trim() ?? null;
    let alreadyPaid = false;

    if (paid) {
      const db = createSupabaseServiceRoleClient();
      const result = await markHouseholdChargePaidFromStripeSession(db, session);
      chargeId = result.chargeId ?? chargeId;
      alreadyPaid = result.alreadyPaid ?? false;
    } else if (processing) {
      // Persist the clearing-window hold immediately on return from checkout —
      // the webhook usually lands first, but this covers delayed delivery.
      const db = createSupabaseServiceRoleClient();
      await markHouseholdChargeProcessingFromStripeSession(db, session);
    }

    return NextResponse.json({
      paid,
      processing,
      paymentStatus: session.payment_status,
      chargeId,
      alreadyPaid,
      sessionId: session.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to verify session";
    if (message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE")) {
      return NextResponse.json({ error: "Stripe is not configured on the server." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
