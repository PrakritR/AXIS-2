import Link from "next/link";
import {
  demoApplicantRows,
  demoKpis,
  demoManagerHouseRows,
  demoManagerPaymentLedgerRows,
  demoManagerWorkOrderRowsFull,
} from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-4 transition hover:border-primary/25 hover:bg-white hover:shadow-sm"
    >
      <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </Link>
  );
}

export function ManagerDashboard() {
  const pendingProperties = demoManagerHouseRows.filter((p) => p.bucket === "pending").length;
  const pendingApplications = demoApplicantRows.filter((a) => a.stage !== "Rejected" && a.stage !== "Approved").length;

  return (
    <ManagerSectionShell title="Dashboard" filters={<PortalPropertyFilter />} actions={[{ label: "Refresh", variant: "outline" }]}>
      <div className="space-y-4">
        {Number(demoKpis.payments.overdue) > 0 ? (
          <p className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950">
            <span className="font-semibold">{demoKpis.payments.overdue}</span> payment line
            {Number(demoKpis.payments.overdue) === 1 ? " is" : "s are"} overdue.{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/payments">
              Open payments
            </Link>
          </p>
        ) : null}
        {pendingProperties > 0 || pendingApplications > 0 ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            {pendingProperties > 0 ? (
              <>
                <span className="font-semibold">{pendingProperties}</span> propert{pendingProperties === 1 ? "y" : "ies"} pending
                approval.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/properties">
                  Review properties
                </Link>
              </>
            ) : null}
            {pendingProperties > 0 && pendingApplications > 0 ? <span className="mx-1">·</span> : null}
            {pendingApplications > 0 ? (
              <>
                <span className="font-semibold">{pendingApplications}</span> application{pendingApplications === 1 ? "" : "s"} need a
                decision.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/applications">
                  Open applications
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLink label="Properties" value={String(demoManagerHouseRows.length)} href="/manager/properties" />
          <StatLink label="Applications" value={String(demoApplicantRows.length)} href="/manager/applications" />
          <StatLink label="Leases" value="4" href="/manager/leases" />
          <StatLink label="Payments" value={String(demoManagerPaymentLedgerRows.length)} href="/manager/payments" />
          <StatLink label="Work orders" value={String(demoManagerWorkOrderRowsFull.length)} href="/manager/work-orders" />
          <StatLink label="Inbox" value="5" href="/manager/inbox" />
        </div>
      </div>
    </ManagerSectionShell>
  );
}
