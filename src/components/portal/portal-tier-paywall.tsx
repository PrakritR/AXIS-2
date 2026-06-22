import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";

const primaryCta =
  "btn-cobalt inline-flex min-h-[44px] items-center justify-center rounded-full px-8 text-sm font-semibold transition hover:brightness-[1.04]";

/** Shown when a property portal user on the Free plan opens a paid section. */
export function PortalTierPaywall({ basePath }: { basePath: "/portal" }) {
  return (
    <ManagerPortalPageShell title="Upgrade to Pro">
      <div className="glass-card relative mx-auto max-w-lg overflow-hidden rounded-2xl">
        <div
          className="h-1 bg-[linear-gradient(135deg,#2a3c5e,#16233f,#0e1830)] [html[data-theme=light]_&]:bg-[linear-gradient(135deg,var(--primary),var(--primary-alt))]"
          aria-hidden
        />
        <div className="space-y-4 px-6 py-8 text-center">
          <p className="text-sm leading-relaxed text-muted">
            This area requires <span className="font-semibold text-foreground">Pro</span> or{" "}
            <span className="font-semibold text-foreground">Business</span>. Upgrade to unlock the Residents tab — lease
            generation, work orders, inbox, and account links. The Free plan includes property listings, applications, and
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
