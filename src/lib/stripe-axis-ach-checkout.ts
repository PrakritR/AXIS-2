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

/**
 * Stripe payment-method selection for a resident/applicant Checkout session.
 *
 * Returns EITHER an explicit `payment_method_types` allowlist OR a
 * `payment_method_configuration` (dynamic payment methods) — never both, since
 * Stripe rejects a session that sets the two together.
 *
 * Apple Pay / Google Pay are card wallets: they only ride on the `card`
 * method-class sessions, whose processing fee (2.9% + $0.30) is identical for a
 * plain card, Apple Pay, or Google Pay — so the fee line item baked before the
 * session (see below) is correct no matter which the buyer taps. When
 * `STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION` names a card-scoped PMC we
 * use dynamic payment methods (Stripe's recommended path for surfacing wallets,
 * matching the subscription flow in `subscription-checkout-session.ts`); the
 * PMC must exclude bank/ACH so a card session never surfaces a method with a
 * different fee. Without the env we fall back to an explicit `["card"]` type,
 * which still surfaces Apple Pay on one-time (`mode: "payment"`) Checkout once
 * the domain is registered, and never leaks a wrong-fee method.
 *
 * `ach` stays an explicit `us_bank_account` session (its own lower fee); `link`
 * keeps its explicit Link+card allowlist.
 */
async function paymentMethodStripeConfig(
  stripe: Stripe,
  method: ResidentAxisPaymentMethod,
): Promise<
  | {
      payment_method_types: ("card" | "link" | "us_bank_account")[];
      payment_method_options?: {
        us_bank_account?: {
          financial_connections: { permissions: ["payment_method"] };
          verification_method: "automatic";
        };
      };
    }
  | { payment_method_configuration: string }
> {
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
  const cardPmc = process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION?.trim();
  if (cardPmc && (await cardScopedPaymentMethodConfiguration(stripe, cardPmc))) {
    return { payment_method_configuration: cardPmc };
  }
  return { payment_method_types: ["card"] };
}

/**
 * Payment methods whose Stripe processing cost is the card rate (2.9% + $0.30),
 * i.e. the ones the card session's pre-baked fee line item already prices
 * correctly. Apple Pay / Google Pay are card wallets and settle as `card`; Link
 * is priced identically (`RESIDENT_PROCESSING_FEE_BPS.link` in
 * `payment-policy.ts`) and Stripe commonly enables it alongside card, so a PMC
 * carrying it is still fee-exact and must not be rejected.
 */
const CARD_CLASS_PAYMENT_METHODS = new Set(["card", "apple_pay", "google_pay", "link"]);

const cardPmcScopeCache = new Map<string, { cardScoped: boolean; expiresAt: number }>();
const CARD_PMC_CACHE_TTL_MS = 10 * 60_000;
const CARD_PMC_ERROR_CACHE_TTL_MS = 60_000;

/**
 * A card session bakes the card processing fee AND the Connect
 * `application_fee_amount` before the session exists, so a PMC that also enables
 * a different-fee method (`us_bank_account`, Klarna, Affirm, …) would silently
 * break the "manager payout == full subtotal" invariant and mislabel
 * `metadata.payment_method` for the webhook. Verify the configuration really is
 * card-scoped before trusting it; anything else (including a failed lookup)
 * falls back to the explicit `["card"]` allowlist, which is always fee-correct.
 */
async function cardScopedPaymentMethodConfiguration(stripe: Stripe, pmcId: string): Promise<boolean> {
  const cached = cardPmcScopeCache.get(pmcId);
  if (cached && cached.expiresAt > Date.now()) return cached.cardScoped;

  let config: Record<string, unknown>;
  try {
    config = (await stripe.paymentMethodConfigurations.retrieve(pmcId)) as unknown as Record<string, unknown>;
  } catch (e) {
    console.error(
      `[stripe] Could not verify STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION (${pmcId}) is card-scoped; falling back to explicit card payment methods.`,
      e,
    );
    cardPmcScopeCache.set(pmcId, { cardScoped: false, expiresAt: Date.now() + CARD_PMC_ERROR_CACHE_TTL_MS });
    return false;
  }

  const offending = Object.entries(config)
    .filter(([name, value]) => !CARD_CLASS_PAYMENT_METHODS.has(name) && paymentMethodEntryEnabled(value))
    .map(([name]) => name);

  const cardScoped = offending.length === 0;
  if (!cardScoped) {
    console.error(
      `[stripe] STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION (${pmcId}) enables non-card methods [${offending.join(", ")}] whose processing fee differs from card; falling back to explicit card payment methods. Scope the configuration to card + Apple Pay + Google Pay (+ Link).`,
    );
  }
  cardPmcScopeCache.set(pmcId, { cardScoped, expiresAt: Date.now() + CARD_PMC_CACHE_TTL_MS });
  return cardScoped;
}

function paymentMethodEntryEnabled(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as { available?: unknown; display_preference?: { value?: unknown } };
  if (!("display_preference" in entry)) return false;
  return entry.available === true || entry.display_preference?.value === "on";
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
  const paymentMethodConfig = await paymentMethodStripeConfig(stripe, paymentMethod);

  const sessionBase = {
    mode: "payment" as const,
    customer_email: residentEmail,
    ...paymentMethodConfig,
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
