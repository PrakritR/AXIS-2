import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import { PortalLeaseWorkflowClient } from "@/components/portal/portal-lease-workflow-client";
import { demoKpis } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

export function ManagerLeases({ leaseWorkflowMode = "manager" }: { leaseWorkflowMode?: "manager" | "owner" }) {
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

      <div className="mt-10 border-t border-slate-200 pt-8">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Demo workflow</p>
        <p className="mt-1 text-sm text-slate-500">
          Generated lease from application + unit, lease thread (residents do not see admin notes), and manager-posted charges.
        </p>
        <div className="mt-4">
          <PortalLeaseWorkflowClient mode={leaseWorkflowMode} />
        </div>
      </div>
    </ManagerSectionShell>
  );
}
