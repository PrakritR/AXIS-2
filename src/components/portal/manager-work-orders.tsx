import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

export function ManagerWorkOrders() {
  return (
    <ManagerSectionShell
      title="Work orders"
      filters={<PortalPropertyFilter applications />}
      actions={[{ label: "Refresh", variant: "outline" }]}
    >
      <ManagerWorkOrdersPanel />
    </ManagerSectionShell>
  );
}
