import type Stripe from "stripe";
import { axisAchPlatformFeeCents } from "@/lib/stripe-household-charge";

export const APPLICATION_FEE_CHECKOUT_PURPOSE = "rental_application_fee";

export type AxisAchCheckoutMode = "embedded" | "hosted";

export function stripeNotConfiguredError(message: string): boolean {
  return message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE");
}

export type AxisAchLineItem = {
  amountCents: number;
  productName: string;
  productDescription?: string;
};

export type AxisAchCheckoutInput = {
  residentEmail: string;
  /** Total cents when using a single line item (default). */
  amountCents?: number;
  productName?: string;
  productDescription?: string;
  /** Multiple line items for paying several charges in one checkout. */
  lineItems?: AxisAchLineItem[];
  metadata: Record<string, string>;
  returnUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  mode: AxisAchCheckoutMode;
  destinationAccountId: string;
};

export type AxisAchCheckoutResult =
  | { mode: "embedded"; clientSecret: string; sessionId: string; platformFeeCents: number }
  | { mode: "hosted"; url: string; sessionId: string; platformFeeCents: number };

export function axisAchCheckoutPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

export function axisAchCheckoutProcessing(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && session.payment_status === "unpaid";
}

/**
 * Creates a Stripe Checkout Session for US bank account (ACH) Connect destination charges.
 * Used only for resident portal payments (rent, utilities, application fees) — not manager subscriptions.
 * Property managers must have ACH enabled in their Stripe Dashboard payment method settings.
 */
export async function createAxisAchCheckoutSession(
  stripe: Stripe,
  input: AxisAchCheckoutInput,
): Promise<AxisAchCheckoutResult> {
  const lineItems =
    input.lineItems && input.lineItems.length > 0
      ? input.lineItems
      : [
          {
            amountCents: Math.round(input.amountCents ?? 0),
            productName: input.productName?.trim() || "Resident payment",
            productDescription: input.productDescription,
          },
        ];

  const amountCents = lineItems.reduce((sum, item) => sum + Math.round(item.amountCents), 0);
  if (amountCents < 100) {
    throw new Error("Amount must be at least $1.00.");
  }

  const applicationFeeAmount = axisAchPlatformFeeCents(amountCents);
  if (applicationFeeAmount > 0 && applicationFeeAmount >= amountCents) {
    throw new Error("Platform fee configuration prevents this charge.");
  }

  const residentEmail = input.residentEmail.trim().toLowerCase();
  const paymentIntentData: {
    transfer_data: { destination: string };
    metadata: Record<string, string>;
    application_fee_amount?: number;
  } = {
    transfer_data: { destination: input.destinationAccountId },
    metadata: input.metadata,
  };
  if (applicationFeeAmount > 0) {
    paymentIntentData.application_fee_amount = applicationFeeAmount;
  }

  const sessionBase = {
    mode: "payment" as const,
    customer_email: residentEmail,
    payment_method_types: ["us_bank_account"],
    payment_method_options: {
      us_bank_account: {
        financial_connections: { permissions: ["payment_method"] },
        verification_method: "automatic" as const,
      },
    },
    line_items: lineItems.map((item) => ({
      price_data: {
        currency: "usd" as const,
        product_data: {
          name: item.productName,
          description: item.productDescription,
        },
        unit_amount: Math.round(item.amountCents),
      },
      quantity: 1,
    })),
    metadata: input.metadata,
    payment_intent_data: paymentIntentData,
  };

  if (input.mode === "embedded") {
    if (!input.returnUrl?.trim()) throw new Error("returnUrl is required for embedded checkout.");
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      ...sessionBase,
      return_url: input.returnUrl,
    } as unknown as Parameters<typeof stripe.checkout.sessions.create>[0]);
    if (!session.client_secret) throw new Error("Stripe did not return a client secret.");
    return {
      mode: "embedded",
      clientSecret: session.client_secret,
      sessionId: session.id,
      platformFeeCents: applicationFeeAmount,
    };
  }

  if (!input.successUrl?.trim() || !input.cancelUrl?.trim()) {
    throw new Error("successUrl and cancelUrl are required for hosted checkout.");
  }
  const session = await stripe.checkout.sessions.create({
    ...sessionBase,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  } as Parameters<typeof stripe.checkout.sessions.create>[0]);
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return {
    mode: "hosted",
    url: session.url,
    sessionId: session.id,
    platformFeeCents: applicationFeeAmount,
  };
}
