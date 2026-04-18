import { Card } from "@/components/ui/card";
import { ManagerSectionShell } from "./manager-section-shell";

const propertyCards = [
  { name: "Pioneer Heights", units: "42 beds", occupancy: "95%", leasing: "3 tours pending", status: "Stable" },
  { name: "Marina Commons", units: "28 beds", occupancy: "89%", leasing: "1 room held", status: "Watchlist" },
  { name: "Summit House", units: "16 beds", occupancy: "100%", leasing: "Waitlist active", status: "Full" },
];

const upcomingTasks = [
  { property: "Pioneer Heights", task: "Renew utility contract", owner: "Ops", due: "Today" },
  { property: "Marina Commons", task: "Review two photo updates", owner: "Leasing", due: "Tomorrow" },
  { property: "Summit House", task: "Approve July pricing", owner: "You", due: "Fri" },
];

export function ManagerProperties() {
  return (
    <ManagerSectionShell
      eyebrow="Portfolio"
      title="Properties"
      subtitle="Monitor occupancy, listing quality, and near-term property tasks from one place."
      actions={[
        { label: "Add property" },
        { label: "Export portfolio", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-3">
          {propertyCards.map((property) => (
            <Card key={property.name} className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">{property.status}</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-950">{property.name}</h2>
              <dl className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-4">
                  <dt>Inventory</dt>
                  <dd className="font-semibold text-slate-900">{property.units}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Occupancy</dt>
                  <dd className="font-semibold text-slate-900">{property.occupancy}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>Leasing</dt>
                  <dd className="font-semibold text-slate-900">{property.leasing}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Property checklist</p>
          <div className="mt-4 space-y-3">
            {upcomingTasks.map((task) => (
              <div key={task.property + task.task} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{task.task}</p>
                    <p className="mt-1 text-sm text-slate-600">{task.property}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {task.due}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{task.owner}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </ManagerSectionShell>
  );
}
