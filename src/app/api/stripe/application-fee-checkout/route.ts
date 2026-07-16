import { NextResponse } from "next/server";
import { applicationFeeCentsFromPropertyData } from "@/lib/application-fee-server";
import { resolveAppOrigin } from "@/lib/app-url";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/parse-money";
import { normalizeManagerSkuTier } from "@/lib/manager-access";
import { getManagerPurchaseSku } from "@/lib/manager-access-server";
import { listingApplicationFeeChannels } from "@/lib/rental-application/application-fee-channel";
import {
  APPLICATION_FEE_CHECKOUT_PURPOSE,
  createAxisAchCheckoutSession,
  stripeNotConfiguredError,
} from "@/lib/stripe-axis-ach-checkout";
import { resolveAndValidateManagerConnectForPayments } from "@/lib/stripe-connect";

export const runtime = "nodejs";

type Body = {
  propertyId?: string;
  residentEmail?: string;
  residentName?: string;
  /** Gross amount in USD cents (integer). */
  amountCents?: number;
  /** Listing owner Supabase user id (matches `profiles.id` / `MockProperty.managerUserId`). */
  managerUserId?: string;
  /** Checkout return path (defaults to public apply). Must start with `/`. */
  returnPath?: string;
};

function clampAmountCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const x = Math.round(n);
  if (x < 100 || x > 100_000) return 0;
  return x;
}

function listingFromPropertyData(propertyData: unknown): ManagerListingSubmissionV1 | null {
  if (!propertyData || typeof propertyData !== "object") return null;
  const submission = (propertyData as { listingSubmission?: unknown }).listingSubmission;
  if (!submission || typeof submission !== "object") return null;
  if ((submission as { v?: unknown }).v !== 1) return null;
  return normalizeManagerListingSubmissionV1(submission as ManagerListingSubmissionV1);
}

/**
 * Creates a Stripe Checkout Session (ACH / US bank account) with Connect destination charges
 * for the rental application fee when Axis payments are enabled on the listing.
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
    const { data: propertyRow } = await db
      .from("manager_property_records")
      .select("property_data, manager_user_id")
      .eq("id", propertyId)
      .maybeSingle();

    // The Connect payout destination must be the property's REAL owner (server
    // record), so verify the client-supplied managerUserId actually owns this
    // property — otherwise the application fee could be routed to an arbitrary
    // manager's Connect account.
    const ownerUserId = String(propertyRow?.manager_user_id ?? "").trim();
    if (!ownerUserId || managerUserId !== ownerUserId) {
      return NextResponse.json({ error: "This property is not owned by the specified manager." }, { status: 403 });
    }

    const listing = listingFromPropertyData(propertyRow?.property_data);
    if (!listingApplicationFeeChannels(listing ?? undefined).ach) {
      return NextResponse.json(
        {
          code: "AXIS_PAYMENTS_DISABLED",
          error: "Bank (ACH) payments are not enabled for this property. Use Zelle or Venmo if available.",
        },
        { status: 422 },
      );
    }

    // The charge amount is derived from the listing's SERVER-stored application
    // fee, never from body.amountCents — otherwise an applicant could pay $1 for a
    // fee the manager configured at, say, $50, and still be marked fee-paid.
    const amountCents = clampAmountCents(parseMoneyAmount(listing?.applicationFee ?? "") * 100);
    if (amountCents <= 0) {
      return NextResponse.json(
        { code: "NO_APPLICATION_FEE", error: "This listing has no application fee configured." },
        { status: 422 },
      );
    }

    const stripe = getStripe();
    const connect = await resolveAndValidateManagerConnectForPayments(stripe, db, managerUserId);
    if (!connect.ok) {
      return NextResponse.json(
        {
          code: connect.code === "NO_ACCOUNT" ? "MANAGER_NO_CONNECT_ACCOUNT" : "MANAGER_CONNECT_TRANSFERS_NOT_READY",
          error: connect.error,
        },
        { status: 422 },
      );
    }

    const { tier: managerTierRaw } = await getManagerPurchaseSku(managerUserId);
    const managerTier = normalizeManagerSkuTier(managerTierRaw) ?? "free";

    const appUrl = resolveAppOrigin(req);
    const returnPath =
      typeof body.returnPath === "string" && body.returnPath.startsWith("/")
        ? body.returnPath.split("?")[0] ?? "/rent/apply"
        : "/rent/apply";

    const metadata: Record<string, string> = {
      purpose: APPLICATION_FEE_CHECKOUT_PURPOSE,
      property_id: propertyId.slice(0, 450),
      resident_email: residentEmail.toLowerCase().slice(0, 450),
      manager_user_id: managerUserId,
    };
    if (residentName) metadata.resident_name = residentName.slice(0, 450);

    const result = await createAxisAchCheckoutSession(stripe, {
      residentEmail,
      amountCents,
      productName: "Rental application fee",
      productDescription: `Listing ${propertyId.slice(0, 120)}`,
      metadata,
      mode: "hosted",
      destinationAccountId: connect.accountId,
      managerTier,
      paymentMethod: "ach",
      successUrl: `${appUrl}${returnPath}?fee_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${returnPath}?fee_checkout=cancel`,
    });

    if (result.mode !== "hosted") {
      return NextResponse.json({ error: "Hosted checkout URL was not returned." }, { status: 500 });
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
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
