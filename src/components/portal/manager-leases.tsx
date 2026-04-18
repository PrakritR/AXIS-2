import { DataTable } from "@/components/ui/table";
import { demoKpis, demoLeasePipelineRows } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const columns = [
  { key: "resident", label: "Resident" },
  { key: "unit", label: "Unit / home" },
  { key: "stage", label: "Stage" },
  { key: "updated", label: "Updated" },
] as const;

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
      <DataTable columns={[...columns]} rows={demoLeasePipelineRows as unknown as Record<string, string>[]} />
    </ManagerSectionShell>
  );
}
