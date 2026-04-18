import { Card } from "@/components/ui/card";
import { demoOwnerPropertyCards } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

export function OwnerProperties() {
  return (
    <ManagerSectionShell
      title="Properties"
      filters={<PortalPropertyFilter />}
      actions={[{ label: "Refresh", variant: "outline" }]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {demoOwnerPropertyCards.map((p) => (
          <Card key={p.name} className="border-slate-200/80 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-primary/80">Linked</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{p.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Manager · {p.manager}</p>
            <dl className="mt-4 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <dt>Inventory</dt>
                <dd className="font-semibold text-slate-900">{p.units}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Access</dt>
                <dd className="font-semibold text-slate-900">{p.access}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
