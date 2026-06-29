import Link from "next/link";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";

/** Shown for Free-tier property portal users — links to Billing in Settings. */
export function ManagerPlanBanner({ planHref = MANAGER_PLAN_PORTAL_URL }: { planHref?: string }) {
  return (
    <div className="shrink-0 border-b border-amber-300 bg-[#fffbeb] px-[max(1rem,env(safe-area-inset-left,0px))] py-2.5 pe-[max(1rem,env(safe-area-inset-right,0px))] text-center text-xs leading-snug text-amber-950 sm:text-sm lg:px-8">
      <p className="font-medium">
        You&apos;re on the <span className="font-semibold">Free</span> plan (1 property).{" "}
        <Link href={planHref} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
          Upgrade to Pro or Business
        </Link>{" "}
        for residents, leases, inbox, and co-managers.
      </p>
    </div>
  );
}
