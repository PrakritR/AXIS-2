import Link from "next/link";

/** Shown for Free-tier managers/owners — links to Plan where they can choose Pro or Business. */
export function ManagerPlanBanner({ planHref = "/pro/plan" }: { planHref?: string }) {
  return (
    <div className="shrink-0 border-b border-amber-300 bg-[#fffbeb] px-4 py-2.5 text-center text-sm text-amber-950 lg:px-8">
      <p className="font-medium">
        <span className="font-semibold">Free</span> plan — 1 property, calendar & inbox, account links (1 manager / 1 owner side), no leases or work orders.
        Upgrade to{" "}
        <span className="font-semibold">Pro</span> or <span className="font-semibold">Business</span> for the full portal.{" "}
        <Link href={planHref} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
          Plan
        </Link>
      </p>
    </div>
  );
}
