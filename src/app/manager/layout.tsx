import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { managerPortal } from "@/lib/portals/manager";
import Link from "next/link";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,_#eef7ff_0%,_#f8fbff_16%,_#ffffff_52%,_#f8fbff_100%)]">
      <div className="border-b border-primary/10 bg-white/75 px-4 py-3 backdrop-blur-sm lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/70">Axis Housing</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Manager portal</p>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block lg:hidden">
              Portfolio operations, leasing, billing, and resident support.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <p className="hidden text-sm text-slate-500 lg:block">Portfolio operations, leasing, billing, and resident support.</p>
            <Link
              href="/partner/pricing"
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              Manage own properties
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={managerPortal} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
