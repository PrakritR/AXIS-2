"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { openAppUrl, shouldUseInAppConnectFlow } from "@/lib/native/open-url";
import { isDemoModeActive } from "@/lib/demo/demo-session";

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
  variant?: "page" | "embedded" | "inline";
}) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const handledConnectParam = useRef(false);

  const loadStatus = useCallback(async () => {
    if (isDemoModeActive()) {
      setStatusLoaded(true);
      return;
    }
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
    } finally {
      setStatusLoaded(true);
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
    if (typeof window === "undefined" || handledConnectParam.current) return;
    const q = new URLSearchParams(window.location.search).get("connect");
    if (q !== "done" && q !== "refresh") return;
    handledConnectParam.current = true;
    if (q === "done") {
      showToast("Bank account linked.");
    } else {
      showToast("Setup link expired — try again.");
    }
    window.history.replaceState({}, "", `${basePath}/payments`);
    queueMicrotask(() => {
      if (q === "done") setActionError(null);
      void loadStatus();
    });
  }, [basePath, loadStatus, showToast]);

  const startConnect = useCallback(async () => {
    setBusy(true);
    setActionError(null);

    const useInAppFlow = shouldUseInAppConnectFlow();
    let popup: Window | null = null;

    if (!useInAppFlow) {
      // Open synchronously on click so popup blockers allow a new tab (async window.open is often blocked).
      popup = window.open("about:blank", "_blank");
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
    }

    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as OnboardResponse;
      if (!res.ok) {
        const message = body.error ?? "Could not start bank linking.";
        popup?.close();
        setActionError(message);
        showToast(message);
        return;
      }
      if (body.demo && body.message) {
        popup?.close();
        setActionError(body.message);
        showToast(body.message);
        return;
      }
      if (body.url) {
        if (useInAppFlow) {
          void openAppUrl(body.url);
          return;
        }
        popup!.location.href = body.url;
        return;
      }
      popup?.close();
      const message = "Stripe did not return an onboarding URL.";
      setActionError(message);
      showToast(message);
    } catch {
      popup?.close();
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

  if (variant === "inline") {
    if (status?.demo) return null;

    if (!statusLoaded) {
      return (
        <div
          className="inline-flex h-9 min-w-[11.5rem] shrink-0 rounded-full border border-border bg-accent/30"
          aria-hidden
        />
      );
    }

    const statusLabel = ready ? "Bank linked" : status?.connected ? "Finish bank setup" : "Bank not linked";

    return (
      <div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-accent/30 p-1">
        <span
          className={`flex min-h-9 min-w-[7.5rem] shrink-0 items-center truncate rounded-full px-4 py-1.5 text-sm font-semibold ${
            ready
              ? "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
              : blockingError
                ? "text-rose-700 dark:text-rose-400"
                : "text-muted"
          }`}
          title={blockingError ?? statusLabel}
        >
          {blockingError ? "Bank error" : statusLabel}
        </span>
        <button
          type="button"
          className={`flex min-h-9 shrink-0 items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 disabled:opacity-60 ${
            ready
              ? "border border-border bg-card/80 text-foreground shadow-[var(--shadow-sm)] hover:border-primary/30"
              : "btn-cobalt hover:opacity-90"
          }`}
          disabled={busy}
          onClick={() => void startConnect()}
        >
          {busy ? "Opening…" : ready ? "Update" : "Link"}
        </button>
      </div>
    );
  }

  const liveOnLocalHttp =
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim().startsWith("pk_live_") ?? false);

  const stripeTestMode =
    typeof window !== "undefined" &&
    (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim().startsWith("pk_test_") ?? false);

  const body = (
    <div className={`space-y-3 text-sm text-muted ${variant === "embedded" ? "" : "max-w-2xl"}`}>
      {variant !== "embedded" ? (
        <>
          {status?.demo ? (
            <p className="rounded-xl border px-4 py-3 text-sm portal-banner-pending">
              {status.message ?? "Add Stripe keys to enable bank linking."}
            </p>
          ) : null}

          {stripeTestMode && !status?.demo ? (
            <p className="rounded-xl border px-4 py-3 text-sm portal-banner-pending [html[data-native]_&]:hidden">
              Stripe test mode is active — onboarding uses sandbox test banks (e.g. code <span className="font-mono">000000</span>).
              Set live keys (<span className="font-mono">sk_live_</span> / <span className="font-mono">pk_live_</span>) in production to link a real account.
            </p>
          ) : null}

          {liveOnLocalHttp && !blockingError ? (
            <p className="rounded-xl border px-4 py-3 text-sm portal-banner-pending [html[data-native]_&]:hidden">
              You are using live Stripe keys on http://localhost. Bank linking requires HTTPS. Use test keys locally, or deploy
              to your https production URL.
            </p>
          ) : null}

          {blockingError ? (
            <p className="rounded-xl border px-4 py-3 text-sm portal-banner-danger">{blockingError}</p>
          ) : null}
        </>
      ) : null}

      {!status?.demo ? (
        <div
          className={
            variant === "embedded"
              ? "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
              : "rounded-2xl border border-border bg-card px-4 py-5"
          }
        >
          {ready ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
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
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full border border-border bg-accent/30 px-2.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
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
