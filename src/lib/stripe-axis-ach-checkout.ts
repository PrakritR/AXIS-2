import type Stripe from "stripe";
import {
  residentAxisPlatformFeeCents,
  residentConnectApplicationFeeCents,
  residentProcessingFeeCents,
  type ResidentAxisPaymentMethod,
} from "@/lib/payment-policy";

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
  paymentMethod?: ResidentAxisPaymentMethod;
  managerTier?: string | null;
};

export type AxisAchCheckoutResult =
  | {
      mode: "embedded";
      clientSecret: string;
      sessionId: string;
      subtotalCents: number;
      processingFeeCents: number;
      axisFeeCents: number;
      platformFeeCents: number;
      totalCents: number;
      paymentMethod: ResidentAxisPaymentMethod;
    }
  | {
      mode: "hosted";
      url: string;
      sessionId: string;
      subtotalCents: number;
      processingFeeCents: number;
      axisFeeCents: number;
      platformFeeCents: number;
      totalCents: number;
      paymentMethod: ResidentAxisPaymentMethod;
    };

export function axisAchCheckoutPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

export function axisAchCheckoutProcessing(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && session.payment_status === "unpaid";
}

function paymentMethodStripeConfig(method: ResidentAxisPaymentMethod): {
  payment_method_types: ("card" | "link" | "us_bank_account")[];
  payment_method_options?: {
    us_bank_account?: {
      financial_connections: { permissions: ["payment_method"] };
      verification_method: "automatic";
    };
  };
} {
  if (method === "ach") {
    return {
      payment_method_types: ["us_bank_account"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: { permissions: ["payment_method"] },
          verification_method: "automatic",
        },
      },
    };
  }
  if (method === "link") {
    return { payment_method_types: ["link", "card"] };
  }
  return { payment_method_types: ["card"] };
}

/**
 * Creates a Stripe Checkout Session for Connect destination charges.
 * Used for resident portal payments (rent, utilities, application fees) — not manager subscriptions.
 */
export async function createAxisAchCheckoutSession(
  stripe: Stripe,
  input: AxisAchCheckoutInput,
): Promise<AxisAchCheckoutResult> {
  const paymentMethod = input.paymentMethod ?? "ach";
  const chargeLineItems =
    input.lineItems && input.lineItems.length > 0
      ? input.lineItems
      : [
          {
            amountCents: Math.round(input.amountCents ?? 0),
            productName: input.productName?.trim() || "Resident payment",
            productDescription: input.productDescription,
          },
        ];

  const subtotalCents = chargeLineItems.reduce((sum, item) => sum + Math.round(item.amountCents), 0);
  if (subtotalCents < 100) {
    throw new Error("Amount must be at least $1.00.");
  }

  const processingFeeCents = residentProcessingFeeCents(subtotalCents, paymentMethod);
  const axisFeeCents = residentAxisPlatformFeeCents(subtotalCents, input.managerTier);
  const applicationFeeAmount = residentConnectApplicationFeeCents(subtotalCents, paymentMethod, input.managerTier);
  if (applicationFeeAmount > 0 && applicationFeeAmount >= subtotalCents + processingFeeCents + axisFeeCents) {
    throw new Error("Platform fee configuration prevents this charge.");
  }

  const residentEmail = input.residentEmail.trim().toLowerCase();
  const paymentIntentData: {
    transfer_data: { destination: string };
    metadata: Record<string, string>;
    application_fee_amount?: number;
  } = {
    transfer_data: { destination: input.destinationAccountId },
    metadata: {
      ...input.metadata,
      payment_method: paymentMethod,
      manager_tier: input.managerTier?.trim().toLowerCase() || "free",
    },
  };
  if (applicationFeeAmount > 0) {
    paymentIntentData.application_fee_amount = applicationFeeAmount;
  }

  const stripeLineItems: {
    price_data: {
      currency: "usd";
      product_data: { name: string; description?: string };
      unit_amount: number;
    };
    quantity: number;
  }[] = chargeLineItems.map((item) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: item.productName,
        description: item.productDescription,
      },
      unit_amount: Math.round(item.amountCents),
    },
    quantity: 1,
  }));

  if (processingFeeCents + axisFeeCents > 0) {
    const feeParts: string[] = [residentProcessingFeeLabel(paymentMethod)];
    if (axisFeeCents > 0) {
      feeParts.push("PropLane service fee");
    }
    stripeLineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Payment processing & service fee",
          description: feeParts.join(" · "),
        },
        unit_amount: processingFeeCents + axisFeeCents,
      },
      quantity: 1,
    });
  }

  const totalCents = subtotalCents + processingFeeCents + axisFeeCents;
  const { payment_method_types, payment_method_options } = paymentMethodStripeConfig(paymentMethod);

  const sessionBase = {
    mode: "payment" as const,
    customer_email: residentEmail,
    payment_method_types,
    ...(payment_method_options ? { payment_method_options } : {}),
    line_items: stripeLineItems,
    metadata: {
      ...input.metadata,
      payment_method: paymentMethod,
      manager_tier: input.managerTier?.trim().toLowerCase() || "free",
      subtotal_cents: String(subtotalCents),
      processing_fee_cents: String(processingFeeCents),
      axis_fee_cents: String(axisFeeCents),
    },
    payment_intent_data: paymentIntentData,
  };

  const feeResultBase = {
    subtotalCents,
    processingFeeCents,
    axisFeeCents,
    platformFeeCents: applicationFeeAmount,
    totalCents,
    paymentMethod,
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
      ...feeResultBase,
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
    ...feeResultBase,
  };
}

function residentProcessingFeeLabel(method: ResidentAxisPaymentMethod): string {
  if (method === "ach") return "Bank processing";
  if (method === "link") return "Link processing";
  return "Card processing";
}
