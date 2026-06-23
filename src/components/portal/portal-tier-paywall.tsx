import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";

const primaryCta =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_rgba(47,107,255,0.28)] transition hover:brightness-[1.04]";

/** Shown when a property portal user on the Free plan opens a paid section. */
export function PortalTierPaywall({ basePath }: { basePath: "/portal" }) {
  return (
    <ManagerPortalPageShell title="Upgrade to Pro">
      <div className="relative mx-auto max-w-lg overflow-hidden rounded-3xl border border-border glass-card p-8 text-center">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2f6bff,#5a8cff,#bcd4ff)]"
          aria-hidden
        />
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            This area requires <span className="font-semibold text-foreground">Pro</span> or{" "}
            <span className="font-semibold text-foreground">Business</span>. Upgrade to unlock the Residents tab — lease
            generation, work orders, inbox, and co-managers. The Free plan includes property listings, applications, and
            the touring calendar.
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
