import Link from "next/link";

/** Shown for Free-tier managers/owners — links to Plan where they can choose Pro or Business. */
export function ManagerPlanBanner({ planHref = "/manager/plan" }: { planHref?: string }) {
  return (
    <div className="border-b border-amber-300 bg-[#fffbeb] px-4 py-2.5 text-center text-sm text-amber-950 lg:px-8">
      <p className="font-medium">
        <span className="font-semibold">Free</span> plan — core tools only (listings, applications, payments, Stripe, managers). Upgrade to{" "}
        <span className="font-semibold">Pro</span> or <span className="font-semibold">Business</span> for the full portal.{" "}
        <Link href={planHref} className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
          Plan
        </Link>
      </p>
    </div>
  );
}
