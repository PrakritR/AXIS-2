import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";

const primaryCta =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_rgba(47,107,255,0.28)] transition hover:brightness-[1.04]";

/** Shown when a property portal user on the Free plan opens a paid section. */
export function PortalTierPaywall({
  basePath,
  featureLabel,
}: {
  basePath: string;
  featureLabel?: string;
}) {
  const title = featureLabel ? `Upgrade to use ${featureLabel}` : "Upgrade to use";
  const featurePhrase = featureLabel ? (
    <>
      <span className="font-semibold text-foreground">{featureLabel}</span> requires{" "}
    </>
  ) : (
    <>This area requires </>
  );

  return (
    <ManagerPortalPageShell title={title}>
      <div className="relative mx-auto max-w-lg overflow-hidden rounded-3xl border border-border glass-card p-8 text-center">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2f6bff,#5a8cff,#bcd4ff)]"
          aria-hidden
        />
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            {featurePhrase}
            <span className="font-semibold text-foreground">Pro</span> or{" "}
            <span className="font-semibold text-foreground">Business</span>. Upgrade your plan to unlock residents,
            leases, documents, finances, services, inbox, and co-managers. The Free plan includes listings,
            applications, payments, and the touring calendar.
          </p>
          <Link href={`${basePath}/plan`} className={primaryCta}>
            View plans &amp; upgrade
          </Link>
          <p className="text-xs text-muted">
            Already upgraded?{" "}
            <Link href={`${basePath}/dashboard`} className="font-medium text-primary underline-offset-2 hover:underline">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
