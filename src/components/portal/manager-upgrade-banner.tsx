import Link from "next/link";

export function ManagerUpgradeBanner() {
  return (
    <div className="border-b border-amber-300 bg-[#fffbeb] px-4 py-3 text-center text-sm text-amber-950 lg:px-8">
      <p className="font-medium">
        You are on the <span className="font-semibold">Free</span> plan (house posting only).{" "}
        <Link href="/partner/pricing" className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950">
          Upgrade
        </Link>{" "}
        for full access to payments, leases, work orders, calendar, and more.
      </p>
    </div>
  );
}
