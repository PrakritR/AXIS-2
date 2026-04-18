import { DataTable } from "@/components/ui/table";
import { demoKpis, demoWorkOrderRows } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const columns = [
  { key: "id", label: "ID" },
  { key: "unit", label: "Unit" },
  { key: "title", label: "Title" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
] as const;

export function ManagerWorkOrders() {
  return (
    <ManagerSectionShell
      title="Work orders"
      filters={<PortalPropertyFilter applications />}
      actions={[{ label: "Refresh", variant: "outline" }]}
      kpis={[
        { value: demoKpis.workOrders.open, label: "Open" },
        { value: demoKpis.workOrders.scheduled, label: "Scheduled" },
        { value: demoKpis.workOrders.completed, label: "Completed" },
      ]}
    >
      <DataTable columns={[...columns]} rows={demoWorkOrderRows as unknown as Record<string, string>[]} />
    </ManagerSectionShell>
  );
}
