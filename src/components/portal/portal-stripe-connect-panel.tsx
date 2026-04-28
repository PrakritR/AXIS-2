"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

const CONNECT_JS_SRC = "https://connect-js.stripe.com/v1.0/connect.js";

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

type AccountSessionResponse =
  | { clientSecret: string; accountId?: string; demo?: undefined }
  | { demo: true; message: string; clientSecret?: undefined };

type StripeConnectElement = HTMLElement & {
  setOnExit?: (cb: () => void) => void;
  setOnLoaderStart?: (cb: () => void) => void;
  setOnLoadError?: (cb: (event: { error?: { message?: string } }) => void) => void;
};

type StripeConnectInstance = {
  create: (componentName: "account-onboarding" | "payouts") => StripeConnectElement;
};

type StripeConnectGlobal = {
  init?: (opts: {
    publishableKey: string;
    fetchClientSecret: () => Promise<string | undefined>;
    appearance?: Record<string, unknown>;
  }) => StripeConnectInstance;
  onLoad?: () => void;
};

declare global {
  interface Window {
    StripeConnect?: StripeConnectGlobal;
  }
}

let connectScriptPromise: Promise<StripeConnectGlobal> | null = null;

function loadConnectJs(): Promise<StripeConnectGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("Connect.js requires a browser."));
  if (window.StripeConnect?.init) return Promise.resolve(window.StripeConnect);
  if (connectScriptPromise) return connectScriptPromise;
  connectScriptPromise = new Promise((resolve, reject) => {
    window.StripeConnect = window.StripeConnect ?? {};
    window.StripeConnect.onLoad = () => {
      if (window.StripeConnect?.init) resolve(window.StripeConnect);
      else reject(new Error("Stripe Connect.js loaded without init."));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CONNECT_JS_SRC}"]`);
    if (existing) return;
    const script = document.createElement("script");
    script.src = CONNECT_JS_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Could not load Stripe Connect.js."));
    document.head.appendChild(script);
  });
  return connectScriptPromise;
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
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const connectContainerRef = useRef<HTMLDivElement | null>(null);

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

  const createAccountSession = useCallback(async (): Promise<string | undefined> => {
    const res = await fetch("/api/stripe/connect/account-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePath }),
    });
    const body = (await res.json()) as AccountSessionResponse & { error?: string };
    if (!res.ok) {
      throw new Error(body.error ?? "Could not start embedded payout setup.");
    }
    if ("demo" in body && body.demo) {
      showToast(body.message);
      return undefined;
    }
    return body.clientSecret;
  }, [basePath, showToast]);

  const refreshEmbeddedComponent = useCallback(async () => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
    if (!publishableKey) {
      setConnectError("Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to embed Stripe payout setup.");
      return;
    }
    const container = connectContainerRef.current;
    if (!container || !status || status.demo) return;
    setBusy(true);
    setConnectLoading(true);
    setConnectError(null);
    try {
      container.replaceChildren();
      const stripeConnect = await loadConnectJs();
      if (!stripeConnect.init) throw new Error("Stripe Connect.js is unavailable.");
      const instance = stripeConnect.init({
        publishableKey,
        fetchClientSecret: createAccountSession,
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#2563eb",
            borderRadius: "8px",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          },
        },
      });
      const componentName = status.chargesEnabled && status.payoutsEnabled ? "payouts" : "account-onboarding";
      const component = instance.create(componentName);
      component.setOnExit?.(() => {
        showToast("Payout status updated.");
        void loadStatus();
      });
      component.setOnLoaderStart?.(() => setConnectLoading(false));
      component.setOnLoadError?.((event) => {
        setConnectLoading(false);
        setConnectError(event.error?.message ?? "Stripe embedded component could not load.");
      });
      container.appendChild(component);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error.";
      setConnectError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
      setConnectLoading(false);
    }
  }, [createAccountSession, loadStatus, showToast, status]);

  const ready =
    status &&
    status.connected &&
    status.chargesEnabled &&
    status.payoutsEnabled &&
    !status.demo;

  const needsOnboarding = status && !status.demo && !ready;

  useEffect(() => {
    if (variant !== "embedded") return;
    if (status == null || status.demo) return;
    void refreshEmbeddedComponent();
  }, [variant, status, refreshEmbeddedComponent]);

  const body = (
    <div
      className={`space-y-4 text-sm leading-relaxed text-slate-700 ${
        variant === "embedded" ? "max-h-[min(72vh,560px)] overflow-y-auto pr-1" : "max-w-lg"
      }`}
    >
      <div className="space-y-2">
        <p className="font-medium text-slate-900">Link your personal payout account before creating a listing.</p>
        <p className="text-sm text-slate-600">
          This step is only for connecting the bank account or debit card where your Stripe payouts should land.
          Revenue split amounts are configured separately inside account linking after you choose the manager or owner.
        </p>
      </div>

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
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void refreshEmbeddedComponent()}>
            {busy ? "Loading…" : "Reload account linking"}
          </Button>
        </div>
      ) : null}

      {ready ? (
        <div className="pt-1">
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void refreshEmbeddedComponent()}>
            {busy ? "Loading…" : "Reload linked account"}
          </Button>
        </div>
      ) : null}

      {!status?.demo ? (
        <div className="min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {connectLoading ? <div className="px-4 py-6 text-sm text-slate-500">Loading Stripe payout setup…</div> : null}
          {connectError ? <div className="px-4 py-4 text-sm text-rose-800">{connectError}</div> : null}
          <div ref={connectContainerRef} className="min-h-[320px] p-2" />
        </div>
      ) : null}
    </div>
  );

  if (variant === "embedded") {
    return body;
  }

  return <ManagerPortalPageShell title="Payouts">{body}</ManagerPortalPageShell>;
}
