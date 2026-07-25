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
 * method-class sessions, and the payer is charged face value on every method
 * anyway (PropLane absorbs Stripe's processing cost), so the total is the same
 * no matter which the buyer taps. When
 * `STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION` names a card-scoped PMC we
 * use dynamic payment methods (Stripe's recommended path for surfacing wallets,
 * matching the subscription flow in `subscription-checkout-session.ts`); the
 * PMC must exclude bank/ACH so `metadata.payment_method` the webhook reads back
 * stays truthful. Without the env we fall back to an explicit `["card"]` type,
 * which still surfaces Apple Pay on one-time (`mode: "payment"`) Checkout once
 * the domain is registered.
 *
 * `ach` stays an explicit `us_bank_account` session; `link` keeps its explicit
 * Link+card allowlist.
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
 * Payment methods that settle as the card method-class, i.e. the ones a "card"
 * session may legitimately surface. Apple Pay / Google Pay are card wallets and
 * settle as `card`; Link is commonly enabled alongside card, so a PMC carrying
 * it must not be rejected.
 */
const CARD_CLASS_PAYMENT_METHODS = new Set(["card", "apple_pay", "google_pay", "link"]);

const cardPmcScopeCache = new Map<string, { cardScoped: boolean; expiresAt: number }>();
const CARD_PMC_CACHE_TTL_MS = 10 * 60_000;
const CARD_PMC_ERROR_CACHE_TTL_MS = 60_000;

/**
 * A card session records `metadata.payment_method = "card"` before the session
 * exists, so a PMC that also enables a different method (`us_bank_account`,
 * Klarna, Affirm, …) would mislabel the payment for the webhook and for
 * reporting. Verify the configuration really is card-scoped before trusting it;
 * anything else (including a failed lookup) falls back to the explicit
 * `["card"]` allowlist, which is always truthful.
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
      `[stripe] STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION (${pmcId}) enables non-card methods [${offending.join(", ")}], which would mislabel metadata.payment_method; falling back to explicit card payment methods. Scope the configuration to card + Apple Pay + Google Pay (+ Link).`,
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
 * Creates a Stripe Checkout Session for Connect DESTINATION charges: the charge
 * is created on the PLATFORM account (PropLane is merchant of record) with
 * `transfer_data.destination` pointing at the manager's connected account. It is
 * never a direct charge and never uses `on_behalf_of`, so Stripe's processing
 * fee is debited from PropLane's balance, not the manager's.
 *
 * Today `residentProcessingFeeCents` and the tier fee are both 0, so:
 *   payer is charged `subtotalCents`, `application_fee_amount` is omitted, and
 *   the FULL subtotal transfers to the manager — leaving PropLane net short by
 *   exactly Stripe's fee. That is the intended arrangement: residents and
 *   applicants pay face value, managers are kept whole, PropLane absorbs
 *   processing.
 *
 * Used for resident portal payments (rent, utilities, application fees) — not
 * manager subscriptions.
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

  // Unreached while PropLane absorbs processing (both fees are 0), and kept
  // deliberately: it is what keeps the add-on the payer is charged and the
  // application fee we retain in lockstep, so no future fee can be retained
  // without also being disclosed as its own line item.
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

  // Hard money invariant, checked against the numbers actually sent to Stripe:
  // whatever the payer is charged, minus whatever PropLane retains, must equal
  // the subtotal the manager is owed. Today that reduces to
  // `totalCents === subtotalCents` with no application fee at all.
  if (totalCents - applicationFeeAmount !== subtotalCents) {
    throw new Error("Checkout total does not reconcile with the manager payout.");
  }

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
