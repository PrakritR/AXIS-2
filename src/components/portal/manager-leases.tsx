import { Card } from "@/components/ui/card";
import { ManagerSectionShell } from "./manager-section-shell";

const stages = [
  { label: "Drafting", value: "4", hint: "Need resident data merge" },
  { label: "Sent", value: "3", hint: "Awaiting signatures" },
  { label: "Countersign", value: "2", hint: "Admin review due today" },
  { label: "Signed", value: "18", hint: "Move-ins next 30 days" },
];

const leases = [
  { resident: "Sofia Nguyen", home: "Marina Commons · Room 7", status: "Awaiting resident", due: "Today · 5:00 PM" },
  { resident: "Noah Rivera", home: "Pioneer Heights · Room 2A", status: "Manager review", due: "Tomorrow" },
  { resident: "Lila Chen", home: "Summit House · Apt 3", status: "Signed", due: "Move-in May 1" },
];

export function ManagerLeases() {
  return (
    <ManagerSectionShell
      eyebrow="Documents"
      title="Leases"
      subtitle="Track packets through signature, countersign, and move-in readiness."
      actions={[
        { label: "Generate packet" },
        { label: "Open DocuSign queue", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        {stages.map((stage) => (
          <Card key={stage.label} className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{stage.label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950">{stage.value}</p>
            <p className="mt-2 text-sm text-slate-600">{stage.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="grid gap-4">
          {leases.map((lease) => (
            <div key={lease.resident + lease.home} className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-slate-900">{lease.resident}</p>
                <p className="mt-1 text-sm text-slate-600">{lease.home}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Status</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{lease.status}</p>
              </div>
              <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {lease.due}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </ManagerSectionShell>
  );
}
