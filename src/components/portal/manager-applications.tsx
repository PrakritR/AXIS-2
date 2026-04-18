import { DataTable } from "@/components/ui/table";
import { demoApplicantRows, demoKpis } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const columns = [
  { key: "name", label: "Applicant" },
  { key: "property", label: "Property" },
  { key: "stage", label: "Stage" },
  { key: "score", label: "Score" },
] as const;

export function ManagerApplications() {
  return (
    <ManagerSectionShell
      title="Applications"
      filters={<PortalPropertyFilter />}
      actions={[{ label: "Refresh", variant: "outline" }]}
      kpis={[
        { value: demoKpis.applications.pending, label: "Pending" },
        { value: demoKpis.applications.approved, label: "Approved" },
        { value: demoKpis.applications.rejected, label: "Rejected" },
      ]}
    >
      <DataTable columns={[...columns]} rows={demoApplicantRows as unknown as Record<string, string>[]} />
    </ManagerSectionShell>
  );
}
