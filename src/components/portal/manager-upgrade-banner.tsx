import Link from "next/link";

export function ManagerUpgradeBanner() {
  return (
    <div className="border-b border-amber-300 bg-[#fffbeb] px-4 py-2.5 text-center text-sm text-amber-950 lg:px-8">
      <p className="font-medium">
        <span className="font-semibold">Free</span> plan — limited sections.{" "}
        <Link
          href="/manager/upgrade"
          className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
        >
          Upgrade
        </Link>
      </p>
    </div>
  );
}
