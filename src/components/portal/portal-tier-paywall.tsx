import Link from "next/link";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";

const primaryCta =
  "inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:brightness-[1.04]";

/** Shown when a manager/owner on the Free plan opens a section that requires Pro or Business. */
export function PortalTierPaywall({ basePath }: { basePath: "/manager" | "/owner" }) {
  return (
    <ManagerPortalPageShell title="Upgrade to Pro">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-sm leading-relaxed text-slate-600">
          This area is not included on the <span className="font-semibold text-slate-900">Free</span> plan. Upgrade to{" "}
          <span className="font-semibold text-slate-900">Pro</span> or <span className="font-semibold text-slate-900">Business</span> to use
          leases, work orders, calendar, inbox, and other full manager tools. On Free you still have listings, applications, payments, and
          team access.
        </p>
        <Link href={`${basePath}/plan`} className={primaryCta}>
          View plans &amp; upgrade
        </Link>
        <p className="text-xs text-slate-500">
          Already upgraded?{" "}
          <Link href={`${basePath}/dashboard`} className="font-medium text-primary underline-offset-2 hover:underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    </ManagerPortalPageShell>
  );
}
