import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell } from "./manager-section-shell";

const rows = [
  {
    name: "Jordan Lee",
    org: "Axis Property Management",
    properties: "Pioneer Heights",
    email: "jordan@demo.axishousing.com",
    since: "Jan 2025",
  },
  {
    name: "Sam Rivera",
    org: "Axis Property Management",
    properties: "Marina Commons, Summit House",
    email: "sam@demo.axishousing.com",
    since: "Mar 2024",
  },
];

export function OwnerManagers() {
  return (
    <ManagerSectionShell
      eyebrow="Relationships"
      title="Managers"
      subtitle="Property managers assigned to your linked buildings. You can have different managers per property; each manager may oversee multiple sites."
      actions={[{ label: "Message (demo)" }, { label: "View agreements", variant: "outline" }]}
    >
      <div className="space-y-4">
        {rows.map((m) => (
          <Card key={m.email} className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">{m.name}</p>
                <p className="text-sm text-slate-600">{m.org}</p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold text-slate-800">Properties:</span> {m.properties}
                </p>
                <p className="mt-1 text-xs text-slate-500">Since {m.since}</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{m.email}</span>
                <Button type="button" variant="outline">
                  Open manager card (demo)
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
