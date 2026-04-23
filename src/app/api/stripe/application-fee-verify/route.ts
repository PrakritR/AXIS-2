import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Confirms a completed Checkout Session for `rental_application_fee` metadata (return URL flow).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.purpose !== "rental_application_fee") {
      return NextResponse.json({ error: "Not an application fee checkout session." }, { status: 400 });
    }

    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";

    if (!paid) {
      return NextResponse.json(
        {
          paid: false,
          paymentStatus: session.payment_status,
          status: session.status,
          error: "Payment is not completed yet. Wait a moment and try again.",
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      paid: true,
      sessionId: session.id,
      propertyId: session.metadata?.property_id ?? null,
      residentEmail: session.metadata?.resident_email ?? null,
      managerUserId: session.metadata?.manager_user_id ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to verify session";
    if (message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE")) {
      return NextResponse.json({ error: "Stripe is not configured on the server." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
