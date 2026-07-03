import { getManagerPurchaseSku } from "@/lib/manager-access-server";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export type ScreeningChargeResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; code: "no_customer" | "no_payment_method" | "charge_failed"; message: string };

async function defaultPaymentMethodId(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if (customer.deleted) return null;
  const defaultPm = customer.invoice_settings?.default_payment_method;
  if (typeof defaultPm === "string") return defaultPm;
  if (defaultPm && typeof defaultPm === "object" && "id" in defaultPm) return defaultPm.id;

  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return methods.data[0]?.id ?? null;
}

export async function chargeManagerForScreening(opts: {
  managerUserId: string;
  applicationId: string;
  amountCents: number;
}): Promise<ScreeningChargeResult> {
  const { stripeCustomerId } = await getManagerPurchaseSku(opts.managerUserId);
  if (!stripeCustomerId) {
    return {
      ok: false,
      code: "no_customer",
      message: "Add a payment method on the Plan page before ordering applicant screening.",
    };
  }

  const stripe = getStripe();
  const paymentMethodId = await defaultPaymentMethodId(stripe, stripeCustomerId);
  if (!paymentMethodId) {
    return {
      ok: false,
      code: "no_payment_method",
      message: "Add a card on the Plan page before ordering applicant screening.",
    };
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: opts.amountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description: `Applicant screening — ${opts.applicationId}`,
        metadata: {
          purpose: "application_screening",
          application_id: opts.applicationId,
          manager_user_id: opts.managerUserId,
        },
      },
      // Scoped to the payment method (not just the application) so a genuine
      // retry after the manager fixes a declined/expired card gets a fresh
      // attempt, while accidental duplicate submits with the SAME card still
      // dedupe against Stripe instead of double-charging.
      { idempotencyKey: `screening_${opts.applicationId}_${paymentMethodId}` },
    );
    if (intent.status !== "succeeded" && intent.status !== "processing") {
      return {
        ok: false,
        code: "charge_failed",
        message: `Payment did not complete (${intent.status}).`,
      };
    }
    return { ok: true, paymentIntentId: intent.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not charge the manager account.";
    return { ok: false, code: "charge_failed", message };
  }
}
