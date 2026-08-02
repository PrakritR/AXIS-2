"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { Button } from "@/components/ui/button";
import type { CheckrAddOnSlug } from "@/lib/checkr/packages";
import type { CheckrPackage } from "@/lib/checkr/config";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";

/**
 * Inline Stripe payment for applicant screening — card form renders inside the
 * screening modal below the package total. On completion Stripe returns to
 * `returnPath?screening=return&session_id=…`; the parent verifies server-side
 * and keeps the modal open on the background-check view.
 */
export function ScreeningInlinePayment({
  applicationId,
  packageSlug,
  addOnProducts,
  returnPath,
  onPaid,
  onError,
}: {
  applicationId: string;
  packageSlug: CheckrPackage;
  addOnProducts: CheckrAddOnSlug[];
  /** App path Stripe returns to after payment (must start with "/"). */
  returnPath: string;
  onPaid: (backgroundCheck: ApplicationBackgroundCheck) => void;
  onError?: (message: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const selectionKey = `${packageSlug}:${addOnProducts.join(",")}`;

  const start = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setClientSecret(null);
    try {
      const res = await fetch("/api/screening/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId,
          packageSlug,
          addOnProducts,
          mode: "embedded",
          returnPath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        ran?: boolean;
        backgroundCheck?: ApplicationBackgroundCheck;
        error?: string;
      };
      if (!res.ok) {
        const message = data.error ?? "Could not start payment. Please try again.";
        setError(message);
        onError?.(message);
        return;
      }
      if (data.ran && data.backgroundCheck) {
        onPaid(data.backgroundCheck);
        return;
      }
      if (!data.clientSecret) {
        const message = "Stripe did not return a payment form.";
        setError(message);
        onError?.(message);
        return;
      }
      setClientSecret(data.clientSecret);
    } catch {
      const message = "Could not start payment. Please try again.";
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [applicationId, packageSlug, addOnProducts, returnPath, onPaid, onError]);

  useEffect(() => {
    void start();
  }, [start, selectionKey]);

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4" data-attr="screening-inline-error">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <Button type="button" variant="outline" className="px-4 text-[13px]" onClick={() => void start()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-attr="screening-inline-payment">
      {loading && !clientSecret ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted">
          Preparing secure payment…
        </div>
      ) : null}
      {clientSecret ? <StripeEmbeddedCheckout clientSecret={clientSecret} className="min-h-[320px] overflow-hidden rounded-2xl border border-border bg-card" /> : null}
    </div>
  );
}
