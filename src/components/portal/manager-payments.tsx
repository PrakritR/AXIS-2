import { DataTable } from "@/components/ui/table";
import { demoKpis, demoPaymentRows } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const columns = [
  { key: "resident", label: "Resident" },
  { key: "unit", label: "Unit" },
  { key: "amount", label: "Amount" },
  { key: "due", label: "Due" },
  { key: "status", label: "Status" },
] as const;

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
      <DataTable columns={[...columns]} rows={demoPaymentRows as unknown as Record<string, string>[]} />
    </ManagerSectionShell>
  );
}
