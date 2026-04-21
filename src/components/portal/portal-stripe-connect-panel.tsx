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

export function PortalStripeConnectPanel({ basePath }: { basePath: "/manager" | "/owner" }) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);
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
      if (body.demo && body.message) {
        /* demo keys message — optional one-time toast avoided on every load */
      }
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("connect");
    if (q === "done") {
      showToast("Returned from onboarding. Connection status updated below.");
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments/stripe`);
    } else if (q === "refresh") {
      showToast("Setup link expired — starting a fresh connection step.");
      void loadStatus();
      window.history.replaceState({}, "", `${basePath}/payments/stripe`);
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
        showToast(body.error ?? "Could not start payout onboarding.");
        return;
      }
      if ("demo" in body && body.demo) {
        showToast(body.message);
        return;
      }
      if (body.url) {
        window.location.href = body.url;
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

  const inProgress =
    status?.connected &&
    !status.demo &&
    status.detailsSubmitted &&
    !(status.chargesEnabled && status.payoutsEnabled);

  const primaryLabel = !status?.connected
    ? "Connect payout account"
    : ready
      ? "Open payout dashboard"
      : "Continue payout setup";

  return (
    <ManagerPortalPageShell title="Payouts">
      <div className="max-w-2xl space-y-5 text-sm leading-relaxed text-slate-700">
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">How payouts work</p>
          <p className="mt-2">
            Link a verified payout account so residents can pay application fees and rent into your connected balance. You finish identity and
            bank details in the provider&apos;s hosted onboarding flow.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-slate-600">
            <li>
              <span className="font-medium text-slate-800">Free:</span> can connect only one account.
            </li>
            <li className="whitespace-nowrap overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
              <span className="font-medium text-slate-800">Pro / Business:</span> can connect multiple accounts and choose how much percentage goes to each account.
            </li>
          </ul>
        </div>

        {status?.demo ? (
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            {status.message ??
              "Live payout connection is not configured on the server — status here is demo-only until production keys are added."}
          </p>
        ) : null}

        {status?.stripeError ? (
          <p className="rounded-xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-xs text-rose-900">
            Payout provider returned an error while loading your account: {status.stripeError}
          </p>
        ) : null}

        {status && (
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {ready ? "Ready for payouts" : status.connected ? "Setup in progress" : "Not connected"}
            </span>
            {status.accountId ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 font-mono text-[11px] text-slate-600">
                {status.accountId}
              </span>
            ) : null}
          </div>
        )}

        {inProgress ? (
          <p className="text-xs text-slate-600">
            Your provider is still verifying this account or needs more information. Use <span className="font-medium">Continue payout setup</span>{" "}
            to finish in their flow.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void startOnboarding()}>
            {busy ? "Starting…" : primaryLabel}
          </Button>
          <a
            href="https://dashboard.stripe.com/connect/accounts/overview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-px hover:bg-white hover:shadow-md"
          >
            Open provider dashboard
          </a>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
