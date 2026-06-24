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
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as OnboardResponse;
      if (!res.ok) {
        const message = body.error ?? "Could not start bank linking.";
        setActionError(message);
        showToast(message);
        return;
      }
      if (body.demo && body.message) {
        setActionError(body.message);
        showToast(body.message);
        return;
      }
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      const message = "Stripe did not return an onboarding URL.";
      setActionError(message);
      showToast(message);
    } catch {
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

  const body = (
    <div className={`space-y-3 text-sm text-muted ${variant === "embedded" ? "" : "max-w-2xl"}`}>
      <p className="text-sm text-muted">
        Link your bank account through Stripe. Resident payments transfer to your bank.
      </p>

      {status?.demo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          {status.message ?? "Add Stripe keys to enable bank linking."}
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

      {status && !status.demo ? (
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-border bg-accent/30 text-muted"
          }`}
        >
          {ready ? "Bank linked" : status.connected ? "Finish setup" : "Not connected"}
        </span>
      ) : null}

      {!status?.demo ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-5">
          {ready ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Your bank account is connected. Residents can pay you by bank transfer.</p>
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
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Complete a short Stripe form to link your bank. You&apos;ll return here when finished.
              </p>
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
