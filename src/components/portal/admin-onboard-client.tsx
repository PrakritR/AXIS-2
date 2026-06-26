"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OnboardQrCode } from "@/components/portal/onboard-qr-code";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_ONBOARD_TIERS,
  buildManagerOnboardPath,
  buildManagerOnboardUrl,
} from "@/lib/manager-onboard-links";

function usePublicAppOrigin(): string {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    setOrigin(env || window.location.origin);
  }, []);

  return origin;
}

export function AdminOnboardClient() {
  const { showToast } = useAppUi();
  const origin = usePublicAppOrigin();

  const tiers = useMemo(
    () =>
      MANAGER_ONBOARD_TIERS.map((tier) => ({
        ...tier,
        path: buildManagerOnboardPath(tier.id),
        url: origin ? buildManagerOnboardUrl(origin, tier.id) : "",
      })),
    [origin],
  );

  const copyLink = useCallback(
    async (url: string, label: string) => {
      if (!url) {
        showToast("Link not ready yet — try again in a moment.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast(`${label} onboarding link copied.`);
      } catch {
        showToast("Could not copy link.");
      }
    },
    [showToast],
  );

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Onboard</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Share these links or QR codes so property managers can sign up on Free, Pro, or Business. Free tier does not
        require a payment card.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <article
            key={tier.id}
            className="glass-card flex flex-col rounded-2xl border border-border p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Manager plan</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">{tier.label}</h2>
              </div>
              {tier.noCard ? (
                <span className="rounded-full bg-[var(--status-confirmed-bg)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--status-confirmed-fg)]">
                  No card
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{tier.description}</p>

            <div className="mt-6 flex justify-center">
              {tier.url ? <OnboardQrCode url={tier.url} label={tier.label} /> : null}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-muted">Onboarding link</p>
              <p className="break-all rounded-xl border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
                {tier.url || tier.path}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-metallic rounded-full px-4 py-2 text-sm font-semibold text-foreground"
                onClick={() => void copyLink(tier.url, tier.label)}
              >
                Copy link
              </button>
              <Link
                href={tier.path}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cobalt inline-flex items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold"
              >
                Open sign-up
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
