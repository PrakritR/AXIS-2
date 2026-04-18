import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { ownerPortal } from "@/lib/portals/owner";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,_#eef7ff_0%,_#f8fbff_16%,_#ffffff_52%,_#f8fbff_100%)]">
      <div className="border-b border-primary/10 bg-white/75 px-4 py-3 backdrop-blur-sm lg:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/70">Axis Housing</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Owner portal</p>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 sm:text-sm">
              Linked properties only — no inbox or tour calendar. Approvals stay with your property managers.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={ownerPortal} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
