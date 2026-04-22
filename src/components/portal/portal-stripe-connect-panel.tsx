"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

const STRIPE_POPUP = "axisStripePayout";
const POPUP_FEATURES = "popup=yes,width=600,height=720,left=80,top=60,scrollbars=yes,resizable=yes";

type ConnectStatus = {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  demo?: boolean;
  message?: string;
  stripeError?: string;
};

type OnboardResponse =
  | {
      url: string;
      accountId?: string;
      mode?: "express_dashboard" | "onboarding" | "update";
      demo?: undefined;
    }
  | { demo: true; message: string; url?: undefined };

function openStripePopup(url: string): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(url, STRIPE_POPUP, POPUP_FEATURES);
}

export function PortalStripeConnectPanel({
  basePath,
  variant = "page",
}: {
  basePath: "/manager" | "/owner" | "/pro";
  /** `embedded` skips the outer page shell for use inside a modal. */
  variant?: "page" | "embedded";
}) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const autoOnboardSent = useRef(false);

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
    void loadStatus();
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
      showToast("Payout status updated.");
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments`);
    } else if (q === "refresh") {
      showToast("Setup link expired — try again from Payouts.");
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments`);
    }
  }, [basePath, loadStatus, showToast]);

  const startOnboarding = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePath }),
      });
      const body = (await res.json()) as OnboardResponse & { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not start payout setup.");
        return;
      }
      if ("demo" in body && body.demo) {
        showToast(body.message);
        return;
      }
      if (body.url) {
        const w = openStripePopup(body.url);
        if (!w) {
          showToast("Allow popups for this site to open Stripe in a new window.");
        }
      }
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  }, [basePath, showToast]);

  const ready =
    status &&
    status.connected &&
    status.chargesEnabled &&
    status.payoutsEnabled &&
    !status.demo;

  const needsOnboarding = status && !status.demo && !ready;

  useEffect(() => {
    if (variant !== "embedded") return;
    if (autoOnboardSent.current) return;
    if (status == null) return;
    if (status.demo) return;
    if (ready) return;
    autoOnboardSent.current = true;
    void startOnboarding();
  }, [variant, status, ready, startOnboarding]);

  const body = (
    <div
      className={`space-y-4 text-sm leading-relaxed text-slate-700 ${
        variant === "embedded" ? "max-h-[min(72vh,560px)] overflow-y-auto pr-1" : "max-w-lg"
      }`}
    >
      <p className="font-medium text-slate-900">You must set up payout before creating a listing.</p>

      {status?.demo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          {status.message ??
            "Live Stripe is not configured on the server — status here is demo-only until production keys are added."}
        </p>
      ) : null}

      {status?.stripeError ? (
        <p className="rounded-xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-xs text-rose-900">
          {status.stripeError}
        </p>
      ) : null}

      {status && !status.demo ? (
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {ready ? "Payouts ready" : status.connected ? "Setup in progress" : "Not connected"}
          </span>
        </div>
      ) : null}

      {needsOnboarding ? (
        <div className="pt-1">
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void startOnboarding()}>
            {busy ? "Opening…" : "Open Stripe setup"}
          </Button>
        </div>
      ) : null}

      {ready ? (
        <div className="pt-1">
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void startOnboarding()}>
            {busy ? "Opening…" : "Open payout dashboard"}
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (variant === "embedded") {
    return body;
  }

  return <ManagerPortalPageShell title="Payouts">{body}</ManagerPortalPageShell>;
}
