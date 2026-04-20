import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
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
    >
      <ManagerPaymentsLedgerPanel />
    </ManagerSectionShell>
  );
}
