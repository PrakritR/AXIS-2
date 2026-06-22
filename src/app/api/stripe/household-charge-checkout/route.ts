import { NextResponse } from "next/server";
import { resolveAppOrigin } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import type { HouseholdCharge } from "@/lib/household-charges";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { axisPaymentsEnabledOnListing } from "@/lib/payment-policy";
import { householdChargeAmountCents, HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE } from "@/lib/stripe-household-charge";
import { createAxisAchCheckoutSession, stripeNotConfiguredError } from "@/lib/stripe-axis-ach-checkout";
import { resolveManagerConnectAccountId } from "@/lib/stripe-application-fee";

export const runtime = "nodejs";

type Body = {
  chargeId?: string;
  /** When true (default), return embedded checkout client secret. When false, return hosted redirect URL. */
  embedded?: boolean;
};

function listingFromPropertyData(propertyData: unknown): ManagerListingSubmissionV1 | null {
  if (!propertyData || typeof propertyData !== "object") return null;
  const submission = (propertyData as { listingSubmission?: unknown }).listingSubmission;
  if (!submission || typeof submission !== "object") return null;
  if ((submission as { v?: unknown }).v !== 1) return null;
  return normalizeManagerListingSubmissionV1(submission as ManagerListingSubmissionV1);
}

function chargeOwnedByUser(charge: HouseholdCharge, userId: string, email: string): boolean {
  const e = email.trim().toLowerCase();
  if (charge.residentUserId && charge.residentUserId === userId) return true;
  return Boolean(e && charge.residentEmail.trim().toLowerCase() === e);
}

/**
 * Creates Stripe Checkout for a pending household charge (rent, utilities, deposits, etc.) via ACH.
 */
export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const chargeId = typeof body.chargeId === "string" ? body.chargeId.trim() : "";
    const useEmbedded = body.embedded !== false;
    if (!chargeId) {
      return NextResponse.json({ error: "chargeId is required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: row, error: rowErr } = await db
      .from("portal_household_charge_records")
      .select("id, row_data, status, manager_user_id")
      .eq("id", chargeId)
      .maybeSingle();

    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Charge not found." }, { status: 404 });

    const charge = row.row_data as HouseholdCharge | null;
    if (!charge?.id) return NextResponse.json({ error: "Invalid charge record." }, { status: 500 });
    if (row.status === "paid" || charge.status === "paid") {
      return NextResponse.json({ error: "This charge is already paid." }, { status: 409 });
    }

    const userEmail = (user.email ?? "").trim().toLowerCase();
    if (!chargeOwnedByUser(charge, user.id, userEmail)) {
      return NextResponse.json({ error: "You do not have access to this charge." }, { status: 403 });
    }

    const managerUserId = (row.manager_user_id as string | null)?.trim() || charge.managerUserId?.trim() || "";
    if (!managerUserId) {
      return NextResponse.json({ error: "This charge is not linked to a property manager yet." }, { status: 422 });
    }

    const { data: propertyRow } = await db
      .from("manager_property_records")
      .select("property_data")
      .eq("id", charge.propertyId)
      .maybeSingle();

    const listing = listingFromPropertyData(propertyRow?.property_data);
    if (!axisPaymentsEnabledOnListing(listing)) {
      return NextResponse.json(
        {
          code: "AXIS_PAYMENTS_DISABLED",
          error: "Axis bank (ACH) payments are not enabled for this property. Use Zelle or Venmo if available.",
        },
        { status: 422 },
      );
    }

    const destination = await resolveManagerConnectAccountId(db, managerUserId);
    if (!destination) {
      return NextResponse.json(
        {
          code: "MANAGER_NO_CONNECT_ACCOUNT",
          error: "Your property manager has not connected Stripe payouts yet. Use Zelle or Venmo instead.",
        },
        { status: 422 },
      );
    }

    const amountCents = householdChargeAmountCents(charge);
    if (amountCents < 100 || amountCents > 500_000) {
      return NextResponse.json({ error: "Invalid charge amount (must be between $1.00 and $5,000.00)." }, { status: 400 });
    }

    const appUrl = resolveAppOrigin(req);
    const stripe = getStripe();
    const residentEmail = charge.residentEmail.trim().toLowerCase();

    const metadata: Record<string, string> = {
      purpose: HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE,
      charge_id: chargeId,
      property_id: charge.propertyId.slice(0, 450),
      resident_email: residentEmail.slice(0, 450),
      manager_user_id: managerUserId,
    };
    if (charge.title?.trim()) metadata.charge_title = charge.title.trim().slice(0, 450);

    const result = await createAxisAchCheckoutSession(stripe, {
      residentEmail,
      amountCents,
      productName: charge.title?.trim() || "Resident payment",
      productDescription: charge.propertyLabel?.trim() || "Axis Housing",
      metadata,
      destinationAccountId: destination,
      mode: useEmbedded ? "embedded" : "hosted",
      returnUrl: `${appUrl}/resident/payments?ach_checkout=return&session_id={CHECKOUT_SESSION_ID}`,
      successUrl: `${appUrl}/resident/payments?ach_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/resident/payments?ach_checkout=cancel`,
    });

    if (result.mode === "embedded") {
      return NextResponse.json({
        clientSecret: result.clientSecret,
        sessionId: result.sessionId,
        amountCents,
        platformFeeCents: result.platformFeeCents,
      });
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      amountCents,
      platformFeeCents: result.platformFeeCents,
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
