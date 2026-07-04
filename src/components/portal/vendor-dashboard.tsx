"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { WorkOrderStatusBadge } from "@/components/portal/resident-services-panel";
import { readManagerWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

function ChecklistItem({
  done,
  title,
  description,
  href,
}: {
  done: boolean;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-sm)] transition hover:bg-accent/30"
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-[var(--status-success-fg)]/15 text-[var(--status-success-fg)]" : "border border-border text-muted"
        }`}
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </Link>
  );
}

/** Vendor Home — getting-started checklist plus an at-a-glance list of active/assigned work. */
export function VendorDashboard({ displayName }: { displayName: string }) {
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readManagerWorkOrderRows());
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    const sync = () => setRows(readManagerWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  useEffect(() => {
    void fetch("/api/vendor/tax-profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: { w9_attestation?: boolean; legal_name?: string } | null }) => {
        setProfileComplete(Boolean(data.profile?.w9_attestation || data.profile?.legal_name));
      })
      .catch(() => undefined);
  }, []);

  const activeRows = useMemo(
    () =>
      rows
        .filter((r) => r.bucket !== "completed")
        .sort((a, b) => (a.scheduledAtIso ?? "").localeCompare(b.scheduledAtIso ?? "")),
    [rows],
  );

  return (
    <ManagerPortalPageShell title={`Welcome, ${displayName}`}>
      <div className="space-y-6">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Getting started</p>
          <div className="mt-2 space-y-2">
            <ChecklistItem
              done={profileComplete}
              title="Complete your profile"
              description="Add your business & W-9 tax info so managers can pay you correctly."
              href="/vendor/profile"
            />
            <ChecklistItem
              done={false}
              title="Connect payments"
              description="Coming soon — direct payouts through Axis."
              href="/vendor/profile"
            />
            <ChecklistItem
              done={activeRows.length > 0}
              title="See your work orders"
              description="Work offered or assigned to you appears here automatically."
              href="/vendor/work-orders"
            />
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Your active work</p>
          {activeRows.length === 0 ? (
            <div className="mt-2">
              <PortalDataTableEmpty message="No active work orders yet." icon="work-order" />
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {activeRows.slice(0, 5).map((row) => (
                <div key={row.id} className="rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-sm)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{row.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{propertyLabel(row)}</p>
                      {row.scheduled ? <p className="mt-0.5 text-xs text-muted">Scheduled: {row.scheduled}</p> : null}
                    </div>
                    <WorkOrderStatusBadge bucket={row.bucket} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ManagerPortalPageShell>
  );
}
