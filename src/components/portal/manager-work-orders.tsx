import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import { demoKpis } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

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
      <ManagerWorkOrdersPanel />
    </ManagerSectionShell>
  );
}
