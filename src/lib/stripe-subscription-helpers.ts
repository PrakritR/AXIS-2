import type Stripe from "stripe";

/** Stripe typings / API versions differ; read period end defensively. */
function stripeUnixSeconds(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export function stripeSubscriptionPeriodEndSec(sub: unknown): number | null {
  if (!sub || typeof sub !== "object") return null;

  const direct = stripeUnixSeconds((sub as { current_period_end?: unknown }).current_period_end);
  if (direct) return direct;

  const itemEnd = stripeUnixSeconds(
    (sub as { items?: { data?: Array<{ current_period_end?: unknown }> } }).items?.data?.[0]?.current_period_end,
  );
  if (itemEnd) return itemEnd;

  return stripeUnixSeconds((sub as { current_period?: { end?: unknown } }).current_period?.end);
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
