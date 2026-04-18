import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import { demoKpis } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

export function ManagerPayments() {
  return (
    <ManagerSectionShell
      title="Payments"
      filters={<PortalPropertyFilter residents />}
      actions={[
        { label: "Add payment", variant: "primary" },
        { label: "Refresh", variant: "outline" },
      ]}
      kpis={[
        { value: demoKpis.payments.pending, label: "Pending" },
        { value: demoKpis.payments.overdue, label: "Overdue" },
        { value: demoKpis.payments.paid, label: "Paid" },
      ]}
    >
      <ManagerPaymentsLedgerPanel />
    </ManagerSectionShell>
  );
}
