import { NextResponse } from "next/server";
import { resolveAppOrigin } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import type { HouseholdCharge } from "@/lib/household-charges";
import {
  listingFromPropertyData,
  resolveListingForHouseholdCharge,
} from "@/lib/household-charge-payment-eligibility";
import { normalizeManagerSkuTier } from "@/lib/manager-access";
import { getManagerPurchaseSku } from "@/lib/manager-access-server";
import { axisPaymentsEnabledOnListing, type ResidentAxisPaymentMethod } from "@/lib/payment-policy";
import { householdChargeAmountCents, HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE } from "@/lib/stripe-household-charge";
import { createAxisAchCheckoutSession, stripeNotConfiguredError } from "@/lib/stripe-axis-ach-checkout";
import {
  isStripeConnectAccountAccessError,
  managerConnectReconnectMessage,
  resolveAndValidateManagerConnectForPayments,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";

type Body = {
  chargeId?: string;
  chargeIds?: string[];
  embedded?: boolean;
  paymentMethod?: ResidentAxisPaymentMethod;
};

function normalizePaymentMethod(raw: unknown): ResidentAxisPaymentMethod {
  if (raw === "card" || raw === "link") return raw;
  return "ach";
}

function chargeOwnedByUser(charge: HouseholdCharge, userId: string, email: string): boolean {
  const e = email.trim().toLowerCase();
  if (charge.residentUserId && charge.residentUserId === userId) return true;
  return Boolean(e && charge.residentEmail.trim().toLowerCase() === e);
}

/**
 * Creates Stripe Checkout for one or more pending household charges via ACH.
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
    const useEmbedded = body.embedded !== false;
    const paymentMethod = normalizePaymentMethod(body.paymentMethod);
    const requestedIds = [
      ...(Array.isArray(body.chargeIds) ? body.chargeIds : []),
      ...(typeof body.chargeId === "string" ? [body.chargeId] : []),
    ]
      .map((id) => id.trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(requestedIds)];
    if (uniqueIds.length === 0) {
      return NextResponse.json({ error: "chargeId or chargeIds is required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const userEmail = (user.email ?? "").trim().toLowerCase();
    const loaded: Array<{ id: string; charge: HouseholdCharge; managerUserId: string }> = [];

    for (const id of uniqueIds) {
      const { data: row, error: rowErr } = await db
        .from("portal_household_charge_records")
        .select("id, row_data, status, manager_user_id")
        .eq("id", id)
        .maybeSingle();

      if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: `Charge not found: ${id}` }, { status: 404 });

      const charge = row.row_data as HouseholdCharge | null;
      if (!charge?.id) return NextResponse.json({ error: "Invalid charge record." }, { status: 500 });
      if (row.status === "paid" || charge.status === "paid") {
        return NextResponse.json({ error: "One or more selected charges are already paid." }, { status: 409 });
      }
      if (!chargeOwnedByUser(charge, user.id, userEmail)) {
        return NextResponse.json({ error: "You do not have access to one of the selected charges." }, { status: 403 });
      }

      const managerUserId = (row.manager_user_id as string | null)?.trim() || charge.managerUserId?.trim() || "";
      if (!managerUserId) {
        return NextResponse.json({ error: "A selected charge is not linked to a property manager yet." }, { status: 422 });
      }

      const listing =
        listingFromPropertyData(
          (
            await db
              .from("manager_property_records")
              .select("property_data")
              .eq("id", charge.propertyId)
              .maybeSingle()
          ).data?.property_data,
        ) ?? (await resolveListingForHouseholdCharge(db, charge, managerUserId));

      if (!axisPaymentsEnabledOnListing(listing)) {
        return NextResponse.json(
          {
            code: "AXIS_PAYMENTS_DISABLED",
            error: "Bank (ACH) payments are not enabled for all selected properties.",
          },
          { status: 422 },
        );
      }

      loaded.push({ id, charge, managerUserId });
    }

    const managerIds = [...new Set(loaded.map((row) => row.managerUserId))];
    if (managerIds.length !== 1) {
      return NextResponse.json(
        { error: "Pay selected charges together only when they belong to the same property manager." },
        { status: 422 },
      );
    }

    const managerUserId = managerIds[0]!;
    const { tier: managerTierRaw } = await getManagerPurchaseSku(managerUserId);
    const managerTier = normalizeManagerSkuTier(managerTierRaw) ?? "free";
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

    const lineItems = loaded.map(({ charge }) => {
      const amountCents = householdChargeAmountCents(charge);
      if (amountCents < 100 || amountCents > 500_000) {
        throw new Error("Each charge must be between $1.00 and $5,000.00.");
      }
      return {
        amountCents,
        productName: charge.title?.trim() || "Resident payment",
        productDescription: charge.propertyLabel?.trim() || "Axis",
      };
    });

    const amountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
    const residentEmail = loaded[0]!.charge.residentEmail.trim().toLowerCase();
    const appUrl = resolveAppOrigin(req);
    const chargeIdsCsv = loaded.map((row) => row.id).join(",").slice(0, 450);

    const metadata: Record<string, string> = {
      purpose: HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE,
      charge_id: loaded[0]!.id,
      charge_ids: chargeIdsCsv,
      property_id: loaded[0]!.charge.propertyId.slice(0, 450),
      resident_email: residentEmail.slice(0, 450),
      manager_user_id: managerUserId,
      bulk: loaded.length > 1 ? "true" : "false",
    };

    const result = await createAxisAchCheckoutSession(stripe, {
      residentEmail,
      lineItems,
      metadata,
      destinationAccountId: connect.accountId,
      mode: useEmbedded ? "embedded" : "hosted",
      paymentMethod,
      managerTier,
      returnUrl: `${appUrl}/resident/payments?ach_checkout=return&session_id={CHECKOUT_SESSION_ID}`,
      successUrl: `${appUrl}/resident/payments?ach_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/resident/payments?ach_checkout=cancel`,
    });

    if (result.mode === "embedded") {
      return NextResponse.json({
        clientSecret: result.clientSecret,
        sessionId: result.sessionId,
        amountCents,
        subtotalCents: result.subtotalCents,
        processingFeeCents: result.processingFeeCents,
        axisFeeCents: result.axisFeeCents,
        platformFeeCents: result.platformFeeCents,
        totalCents: result.totalCents,
        paymentMethod: result.paymentMethod,
        chargeIds: loaded.map((row) => row.id),
      });
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.sessionId,
      amountCents,
      subtotalCents: result.subtotalCents,
      processingFeeCents: result.processingFeeCents,
      axisFeeCents: result.axisFeeCents,
      platformFeeCents: result.platformFeeCents,
      totalCents: result.totalCents,
      paymentMethod: result.paymentMethod,
      chargeIds: loaded.map((row) => row.id),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    if (stripeNotConfiguredError(message)) {
      return NextResponse.json(
        { code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured on the server (missing STRIPE_SECRET_KEY)." },
        { status: 503 },
      );
    }
    if (isStripeConnectAccountAccessError(message)) {
      return NextResponse.json(
        {
          code: "MANAGER_CONNECT_STALE",
          error: managerConnectReconnectMessage(),
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
