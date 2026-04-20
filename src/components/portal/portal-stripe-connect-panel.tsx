"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

type OnboardResponse =
  | { url: string; accountId?: string; demo?: undefined }
  | { demo: true; message: string; url?: undefined };

export function PortalStripeConnectPanel({ basePath }: { basePath: "/manager" | "/owner" }) {
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState(false);

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
        showToast(body.error ?? "Could not start Stripe onboarding.");
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

  return (
    <ManagerPortalPageShell title="Stripe payouts">
      <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-slate-700">
        <p>
          Connect a <span className="font-semibold text-slate-900">Stripe Express</span> account to receive rent and fee payouts directly.
          Axis uses Stripe Connect; you complete Stripe&apos;s onboarding (identity, bank account) in their hosted flow.
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-600">
          <li>Free plan: connect Stripe to collect rent and application fees you record in Payments.</li>
          <li>Pro/Business: same account applies to all payout-eligible charges in the portal (demo wiring may vary).</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" className="min-h-[44px] rounded-full px-6" disabled={busy} onClick={() => void startOnboarding()}>
            {busy ? "Starting…" : "Connect with Stripe"}
          </Button>
          <a
            href="https://dashboard.stripe.com/connect/accounts/overview"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-px hover:bg-white hover:shadow-md"
          >
            Open Stripe Dashboard
          </a>
        </div>
        <p className="text-xs text-slate-500">
          Requires <span className="font-mono">STRIPE_SECRET_KEY</span> on the server. If keys are missing, the app returns a demo message
          instead of a live link.
        </p>
      </div>
    </ManagerPortalPageShell>
  );
}
