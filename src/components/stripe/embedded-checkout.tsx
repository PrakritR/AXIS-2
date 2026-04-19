"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";

type Props = {
  clientSecret: string;
  onError: (message: string) => void;
};

type EmbeddedApi = { mount: (el: HTMLElement) => void; destroy: () => void };

/**
 * Mounts Stripe Embedded Checkout in-place (same page). Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
 */
export function EmbeddedCheckoutMount({ clientSecret, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<EmbeddedApi | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    (async () => {
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pk?.trim()) {
        onError("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
        setStatus("error");
        return;
      }

      try {
        const stripe = await loadStripe(pk);
        if (!stripe || cancelled) return;

        const s = stripe as unknown as {
          createEmbeddedCheckoutPage?: (opts: { fetchClientSecret: () => Promise<string> }) => Promise<EmbeddedApi>;
          initEmbeddedCheckout?: (opts: { clientSecret: string }) => Promise<EmbeddedApi>;
        };

        const checkout = (await (s.createEmbeddedCheckoutPage
          ? s.createEmbeddedCheckoutPage({
              fetchClientSecret: async () => clientSecret,
            })
          : s.initEmbeddedCheckout?.({ clientSecret }))) as EmbeddedApi | undefined;
        if (!checkout) {
          throw new Error("Stripe.js missing embedded checkout (createEmbeddedCheckoutPage). Update @stripe/stripe-js.");
        }
        if (cancelled) {
          checkout.destroy();
          return;
        }

        checkout.mount(el);
        checkoutRef.current = checkout;
        setStatus("ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load checkout.";
        onError(msg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [clientSecret, onError]);

  return (
    <div className="w-full">
      {status === "loading" ? (
        <p className="text-center text-sm text-slate-500">Loading secure checkout…</p>
      ) : null}
      <div ref={containerRef} className="min-h-[420px] w-full" />
    </div>
  );
}
