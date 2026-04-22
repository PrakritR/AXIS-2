import type Stripe from "stripe";

/** Stripe typings / API versions differ; read period end defensively. */
export function stripeSubscriptionPeriodEndSec(sub: unknown): number | null {
  if (!sub || typeof sub !== "object") return null;
  const v = (sub as { current_period_end?: unknown }).current_period_end;
  return typeof v === "number" ? v : null;
}

/** Invoice → subscription id across Stripe API shape differences. */
export function stripeInvoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const raw = (inv as unknown as { subscription?: unknown }).subscription;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw && typeof (raw as { id: unknown }).id === "string") {
    return String((raw as { id: string }).id).trim();
  }
  return null;
}
