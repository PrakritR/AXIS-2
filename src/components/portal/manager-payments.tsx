"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { mergeManagerPaymentLedger } from "@/lib/demo-manager-payment-ledger";
import { householdChargeToLedgerRow, HOUSEHOLD_CHARGES_EVENT, readChargesForManager } from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

export function ManagerPayments() {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const mergedRows = useMemo(() => {
    void hcTick;
    const fromHc = readChargesForManager(userId).map(householdChargeToLedgerRow);
    return [...fromHc, ...mergeManagerPaymentLedger()];
  }, [userId, hcTick]);

  const counts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const r of mergedRows) {
      c[r.bucket] += 1;
    }
    return c;
  }, [mergedRows]);

  const tabs = useMemo(
    () => PAY_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  const rowsForBucket = useMemo(() => mergedRows.filter((r) => r.bucket === bucket), [mergedRows, bucket]);

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <PortalPropertyFilterPill residents />
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setAddOpen(true)}>
            Add payment
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              setHcTick((n) => n + 1);
              showToast("Payments refreshed.");
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Receiving rent & fees:</span> connect a Stripe Express account on the{" "}
            <Link href="/manager/payments/stripe" className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90">
              Stripe payouts
            </Link>{" "}
            tab so payouts can route to your bank once charges go live.
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
        </div>
      }
    >
      <ManagerPaymentsLedgerPanel rows={rowsForBucket} managerUserId={userId ?? null} activeBucket={bucket} />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          showToast("Payment line added.");
          setAddOpen(false);
        }}
      />
    </ManagerPortalPageShell>
  );
}
