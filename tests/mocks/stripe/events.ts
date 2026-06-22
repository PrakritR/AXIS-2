import type Stripe from "stripe";

export function mockCheckoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    subscription: "sub_test_123",
    customer: "cus_test_123",
    metadata: { tier: "pro", billing: "monthly", manager_id: "MGR-TEST" },
    ...overrides,
  } as Stripe.Checkout.Session;
}

export function mockCheckoutSessionCompletedEvent(session: Stripe.Checkout.Session): Stripe.Event {
  return {
    id: "evt_test_checkout_completed",
    object: "event",
    type: "checkout.session.completed",
    data: { object: session },
  } as Stripe.Event;
}

export function mockAsyncPaymentSucceededEvent(session: Stripe.Checkout.Session): Stripe.Event {
  return {
    id: "evt_test_async_payment",
    object: "event",
    type: "checkout.session.async_payment_succeeded",
    data: { object: session },
  } as Stripe.Event;
}
