"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { demoManagerPaymentLedgerRows } from "@/data/demo-portal";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

function countPayments(rows: typeof demoManagerPaymentLedgerRows) {
  const c: Record<ManagerPaymentBucket, number> = {
    pending: 0,
    overdue: 0,
    paid: 0,
  };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

export function ManagerPayments() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");

  const counts = useMemo(() => countPayments(demoManagerPaymentLedgerRows), []);
  const tabs = useMemo(
    () => PAY_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <PortalPropertyFilterPill residents />
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => showToast("Add payment (demo).")}>
            Add payment
          </Button>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed payments (demo).")}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
        </div>
      }
    >
      <ManagerPaymentsLedgerPanel bucket={bucket} />
    </ManagerPortalPageShell>
  );
}
