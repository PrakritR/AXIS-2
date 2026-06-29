import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";

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
  const featurePhrase = featureLabel ? (
    <>
      <span className="font-semibold text-foreground">{featureLabel}</span> is locked on the Free plan. Upgrade to{" "}
    </>
  ) : (
    <>This section is not included on the Free plan. Upgrade to </>
  );

  return (
    <ManagerPortalPageShell title="Locked">
      <div className="relative mx-auto max-w-lg overflow-hidden rounded-3xl border border-border glass-card p-8 text-center">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2f6bff,#5a8cff,#bcd4ff)]"
          aria-hidden
        />
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">Locked on Pro or Business</p>
          <p className="text-sm leading-relaxed text-muted">
            {featurePhrase}
            <span className="font-semibold text-foreground">Pro</span> or{" "}
            <span className="font-semibold text-foreground">Business</span> to unlock residents, leases, documents,
            finances, services, inbox, and co-managers. Free includes properties, applications, tours, and payments.
          </p>
          <Link href={MANAGER_PLAN_PORTAL_URL} className={primaryCta}>
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
