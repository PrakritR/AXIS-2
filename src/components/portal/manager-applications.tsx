import { Card } from "@/components/ui/card";
import { ManagerSectionShell } from "./manager-section-shell";

const lanes = [
  {
    label: "New",
    count: "6",
    items: [
      { name: "Ella Morgan", property: "Pioneer Heights · Room 4B", note: "Submitted 32m ago" },
      { name: "Jae Kim", property: "Marina Commons · Studio 2", note: "Co-signer invited" },
    ],
  },
  {
    label: "Screening",
    count: "3",
    items: [
      { name: "Noah Rivera", property: "Pioneer Heights · Room 2A", note: "Income docs pending" },
      { name: "Amira Shah", property: "Summit House · Apt 3", note: "Background check in progress" },
    ],
  },
  {
    label: "Decision Ready",
    count: "2",
    items: [
      { name: "Sofia Nguyen", property: "Marina Commons · Room 7", note: "Score 742 · references complete" },
    ],
  },
];

export function ManagerApplications() {
  return (
    <ManagerSectionShell
      eyebrow="Leasing"
      title="Applications"
      subtitle="Triage new applicants quickly, see where screening is blocked, and keep approvals moving."
      actions={[
        { label: "Review queue" },
        { label: "Message applicants", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {lanes.map((lane) => (
          <Card key={lane.label} className="p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-950">{lane.label}</h2>
              <span className="rounded-full bg-primary/[0.08] px-3 py-1 text-sm font-semibold text-primary">{lane.count}</span>
            </div>
            <div className="mt-4 space-y-3">
              {lane.items.map((item) => (
                <div key={item.name} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.property}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{item.note}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
