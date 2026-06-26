"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

type ConnectStatus = {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersEnabled?: boolean;
  paymentReady?: boolean;
  transfersStatus?: string | null;
  detailsSubmitted: boolean;
  demo?: boolean;
  message?: string;
  stripeError?: string;
};

type OnboardResponse = {
  url?: string;
  accountId?: string;
  mode?: string;
  demo?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

export function PortalStripeConnectPanel({
  basePath,
  variant = "page",
}: {
  basePath: string;
  variant?: "page" | "embedded";
}) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectStatus | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect/status", { credentials: "include" });
      const body = (await res.json()) as ConnectStatus & { error?: string };
      if (!res.ok) {
        setStatus(null);
        return;
      }
      setStatus(body);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(id);
  }, [loadStatus]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "axis-stripe-connect") {
        void loadStatus();
      }
    };
    const onCustom = () => void loadStatus();
    window.addEventListener("message", onMsg);
    window.addEventListener("axis-stripe-connect-refresh", onCustom);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("axis-stripe-connect-refresh", onCustom);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("connect");
    if (q === "done") {
      showToast("Bank account linked.");
      setActionError(null);
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments`);
    } else if (q === "refresh") {
      showToast("Setup link expired — try again.");
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments`);
    }
  }, [basePath, loadStatus, showToast]);

  const startConnect = useCallback(async () => {
    setBusy(true);
    setActionError(null);

    // Open synchronously on click so popup blockers allow a new tab (async window.open is often blocked).
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      const message = "Could not open a new tab. Allow pop-ups for this site and try again.";
      setActionError(message);
      showToast(message);
      setBusy(false);
      return;
    }

    try {
      popup.document.title = "Opening Stripe…";
      popup.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#444">Opening secure bank setup…</p>';
    } catch {
      /* cross-origin once navigated; harmless on about:blank */
    }

    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as OnboardResponse;
      if (!res.ok) {
        const message = body.error ?? "Could not start bank linking.";
        popup.close();
        setActionError(message);
        showToast(message);
        return;
      }
      if (body.demo && body.message) {
        popup.close();
        setActionError(body.message);
        showToast(body.message);
        return;
      }
      if (body.url) {
        popup.location.href = body.url;
        popup.opener = null;
        return;
      }
      popup.close();
      const message = "Stripe did not return an onboarding URL.";
      setActionError(message);
      showToast(message);
    } catch {
      popup.close();
      const message = "Could not start bank linking.";
      setActionError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const ready =
    status &&
    status.connected &&
    Boolean(status.paymentReady ?? (status.transfersEnabled && status.payoutsEnabled)) &&
    !status.demo;

  const blockingError = actionError ?? status?.stripeError ?? null;

  const liveOnLocalHttp =
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim().startsWith("pk_live_") ?? false);

  const stripeTestMode =
    typeof window !== "undefined" &&
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim().startsWith("pk_test_") ?? false);

  const body = (
    <div className={`space-y-3 text-sm text-muted ${variant === "embedded" ? "" : "max-w-2xl"}`}>
      {status?.demo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          {status.message ?? "Add Stripe keys to enable bank linking."}
        </p>
      ) : null}

      {stripeTestMode && !status?.demo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          Stripe test mode is active — onboarding uses sandbox test banks (e.g. code <span className="font-mono">000000</span>).
          Set live keys (<span className="font-mono">sk_live_</span> / <span className="font-mono">pk_live_</span>) in production to link a real account.
        </p>
      ) : null}

      {liveOnLocalHttp && !blockingError ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          You are using live Stripe keys on http://localhost. Bank linking requires HTTPS. Use test keys locally, or deploy
          to your https production URL.
        </p>
      ) : null}

      {blockingError ? (
        <p className="rounded-xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">
          {blockingError}
        </p>
      ) : null}

      {!status?.demo ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-5">
          {ready ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                Bank linked
              </span>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => void startConnect()}
              >
                {busy ? "Opening…" : "Update bank details"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Link your bank through Stripe so resident payments deposit to your account.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center rounded-full border border-border bg-accent/30 px-3 py-1 text-xs font-semibold text-muted">
                  {status?.connected ? "Finish setup" : "Not connected"}
                </span>
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => void startConnect()}
                >
                  {busy ? "Opening…" : "Link bank account"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  if (variant === "embedded") {
    return body;
  }

  return <ManagerPortalPageShell title="Bank account">{body}</ManagerPortalPageShell>;
}
