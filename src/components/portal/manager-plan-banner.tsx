import Link from "next/link";

/** Shown for Free-tier property portal users — links to Plan where they can choose Pro or Business. */
export function ManagerPlanBanner({ planHref = "/portal/plan" }: { planHref?: string }) {
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
