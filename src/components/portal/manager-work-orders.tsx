import { Card } from "@/components/ui/card";
import { ManagerSectionShell } from "./manager-section-shell";

const columns = [
  {
    label: "New",
    tone: "bg-amber-50 text-amber-700",
    items: [
      { title: "HVAC tune-up", home: "Pioneer Heights · Unit 12", meta: "Reported 1h ago" },
      { title: "Kitchen leak", home: "Marina Commons · Room 7", meta: "Needs vendor assignment" },
    ],
  },
  {
    label: "Scheduled",
    tone: "bg-sky-50 text-sky-700",
    items: [
      { title: "Dryer vent cleaning", home: "Summit House · Apt 2", meta: "Tomorrow · 11:00 AM" },
    ],
  },
  {
    label: "Completed",
    tone: "bg-emerald-50 text-emerald-700",
    items: [
      { title: "Front door rekey", home: "Pioneer Heights · Unit 8", meta: "Closed this morning" },
    ],
  },
];

export function ManagerWorkOrders() {
  return (
    <ManagerSectionShell
      eyebrow="Operations"
      title="Work orders"
      subtitle="See incoming maintenance volume, vendor scheduling, and recently closed requests."
      actions={[
        { label: "Create work order" },
        { label: "Assign vendor", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <Card key={column.label} className="p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-950">{column.label}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${column.tone}`}>
                {column.items.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {column.items.map((item) => (
                <div key={item.title + item.home} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.home}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{item.meta}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
