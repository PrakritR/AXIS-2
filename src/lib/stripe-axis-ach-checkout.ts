import type Stripe from "stripe";
import { axisAchPlatformFeeCents } from "@/lib/stripe-household-charge";

export const APPLICATION_FEE_CHECKOUT_PURPOSE = "rental_application_fee";

export type AxisAchCheckoutMode = "embedded" | "hosted";

export type AxisAchCheckoutInput = {
  residentEmail: string;
  amountCents: number;
  productName: string;
  productDescription?: string;
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
 * Property managers must have ACH enabled in their Stripe Dashboard payment method settings.
 */
export async function createAxisAchCheckoutSession(
  stripe: Stripe,
  input: AxisAchCheckoutInput,
): Promise<AxisAchCheckoutResult> {
  const amountCents = Math.round(input.amountCents);
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
    line_items: [
      {
        price_data: {
          currency: "usd" as const,
          product_data: {
            name: input.productName,
            description: input.productDescription,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: input.metadata,
    payment_intent_data: paymentIntentData,
  };

  if (input.mode === "embedded") {
    if (!input.returnUrl?.trim()) throw new Error("returnUrl is required for embedded checkout.");
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
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

export function stripeNotConfiguredError(message: string): boolean {
  return message.includes("STRIPE_SECRET_KEY") || message.includes("Missing STRIPE");
}
