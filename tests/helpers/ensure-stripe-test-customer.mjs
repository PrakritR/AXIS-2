/**
 * Provisions REAL Stripe test-mode customers (+ a default test card) for
 * seeded test managers, so manager charges that read
 * `manager_purchases.stripe_customer_id` (e.g. the $29.99 applicant-screening
 * charge in src/lib/screening/charge-manager.ts) succeed against a real test
 * customer instead of a hand-typed placeholder id (`cus_test_*`) that was
 * never created in the Stripe test account.
 *
 * Idempotent: an existing `stripe_customer_id` already on a manager's
 * purchase rows is reused as long as Stripe still recognizes it — only a
 * missing/invalid id triggers creating a new customer.
 */
import Stripe from "stripe";

/** Stripe's reusable Visa test PaymentMethod token — attachable to any test-mode customer. */
const TEST_PAYMENT_METHOD_TOKEN = "pm_card_visa";

export function assertStripeTestMode(secretKey) {
  const key = secretKey?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY — required to provision seeded managers' Stripe test customers.");
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not a test-mode key (sk_test_…) — refusing to provision seed data against it.",
    );
  }
}

export function getSeedStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  assertStripeTestMode(key);
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia", typescript: true });
}

/** Attaches a test card and marks it default, only if the customer doesn't already have one. */
async function ensureDefaultTestPaymentMethod(stripe, customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) throw new Error(`Stripe customer ${customerId} is deleted`);
  if (customer.invoice_settings?.default_payment_method) return;

  const existing = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  const paymentMethodId =
    existing.data[0]?.id ??
    (await stripe.paymentMethods.attach(TEST_PAYMENT_METHOD_TOKEN, { customer: customerId })).id;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

/**
 * Returns a real, chargeable Stripe test customer id for `email` — reusing
 * the first of `candidateCustomerIds` that Stripe still recognizes, or
 * creating a fresh test customer (with a default test card attached) if none
 * of them do.
 */
export async function ensureStripeTestCustomerId(stripe, { email, candidateCustomerIds = [] }) {
  for (const id of candidateCustomerIds) {
    if (!id) continue;
    try {
      const customer = await stripe.customers.retrieve(id);
      if (customer.deleted) continue;
      await ensureDefaultTestPaymentMethod(stripe, id);
      return id;
    } catch (e) {
      // Placeholder / deleted / never-existed id (e.g. "No such customer") — try the next
      // candidate. Any other error (timeout, rate limit) must propagate rather than being
      // treated as "customer missing", or a transient hiccup creates a duplicate customer.
      if (e?.code !== "resource_missing") throw e;
    }
  }

  const created = await stripe.customers.create({
    email,
    description: "Axis seed test manager",
    metadata: { seed: "axis-test" },
  });
  const attached = await stripe.paymentMethods.attach(TEST_PAYMENT_METHOD_TOKEN, { customer: created.id });
  await stripe.customers.update(created.id, {
    invoice_settings: { default_payment_method: attached.id },
  });
  return created.id;
}

/**
 * Ensures every `manager_purchases` row belonging to this manager (matched by
 * user_id OR email, same pairing `manager-access-server.ts` uses to resolve
 * the "best" purchase row) points at one real, chargeable Stripe test
 * customer — reusing whichever existing id on those rows is still valid.
 */
export async function ensureManagerStripeCustomer(stripe, supabase, { email, userId }) {
  const [{ data: byUserId, error: userErr }, { data: byEmail, error: emailErr }] = await Promise.all([
    supabase.from("manager_purchases").select("id, stripe_customer_id").eq("user_id", userId),
    supabase.from("manager_purchases").select("id, stripe_customer_id").ilike("email", email),
  ]);
  if (userErr) throw new Error(`manager_purchases(stripe lookup ${email} by user_id): ${userErr.message}`);
  if (emailErr) throw new Error(`manager_purchases(stripe lookup ${email} by email): ${emailErr.message}`);

  const rows = [...new Map([...(byUserId ?? []), ...(byEmail ?? [])].map((r) => [r.id, r])).values()];
  const candidateCustomerIds = [...new Set(rows.map((r) => r.stripe_customer_id).filter(Boolean))];
  const customerId = await ensureStripeTestCustomerId(stripe, { email, candidateCustomerIds });

  const staleRowIds = rows.filter((r) => r.stripe_customer_id !== customerId).map((r) => r.id);
  if (staleRowIds.length > 0) {
    const { error } = await supabase
      .from("manager_purchases")
      .update({ stripe_customer_id: customerId })
      .in("id", staleRowIds);
    if (error) throw new Error(`manager_purchases(stripe update ${email}): ${error.message}`);
  }
  return customerId;
}
