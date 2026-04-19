/**
 * SaaS checkout from the browser (no secret keys on the client).
 *
 * **Embedded (same page)** — default when `embedded` is omitted or `true`:
 * Server uses `ui_mode: embedded_page`; client mounts with `stripe.createEmbeddedCheckoutPage({ fetchClientSecret })`.
 *
 * ```ts
 * const res = await fetch("/api/stripe/checkout", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     tier: "pro",
 *     billing: "monthly",
 *     email: "user@example.com",
 *     fullName: "Jane Doe",
 *     embedded: true,
 *   }),
 * });
 * const { clientSecret } = (await res.json()) as { clientSecret?: string; error?: string };
 * // Mount with @stripe/stripe-js + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * ```
 *
 * **Hosted (redirect to Stripe)** — set `embedded: false` (uses `ui_mode: hosted_page`):
 *
 * ```ts
 * const { url } = (await res.json()) as { url?: string };
 * if (url) window.location.href = url;
 * ```
 */
export {};
