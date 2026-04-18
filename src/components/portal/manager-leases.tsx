import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import { demoKpis } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

export function ManagerLeases() {
  return (
    <ManagerSectionShell
      title="Leases"
      filters={<PortalPropertyFilter />}
      actions={[{ label: "Refresh", variant: "outline" }]}
      kpis={[
        { value: demoKpis.leases.managerReview, label: "Manager review" },
        { value: demoKpis.leases.adminReview, label: "Admin review" },
        { value: demoKpis.leases.withResident, label: "With resident" },
        { value: demoKpis.leases.signed, label: "Signed" },
      ]}
    >
      <ManagerLeasesPipelinePanel />
    </ManagerSectionShell>
  );
}
