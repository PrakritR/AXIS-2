import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { demoManagerSubscriberRows } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const demoRows = demoManagerSubscriberRows.slice(0, 4);

export function OwnerManagers({ variant = "owner" }: { variant?: "owner" | "manager" }) {
  const intro =
    variant === "manager"
      ? "Invite property managers or staff who can operate day-to-day on your behalf. On the Free plan they still need your account scope; upgrade to Pro for full delegated tools."
      : "Invite property managers to handle day-to-day operations. On the Free plan they can take over Pro-only areas once you upgrade, or you stay on Free and keep core tasks yourself.";
  return (
    <ManagerSectionShell
      title="Managers"
      filters={<PortalPropertyFilter />}
      actions={[
        { label: "Message", variant: "primary" },
        { label: "Refresh", variant: "outline" },
      ]}
    >
      <p className="text-sm text-slate-600">{intro}</p>
      <div className="space-y-3">
        {demoRows.map((m) => (
          <Card key={m.name} className="border-slate-200/80 p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">{m.name}</p>
                <p className="text-sm text-slate-600">{m.org}</p>
                <p className="mt-2 text-sm text-slate-700">{m.portfolio}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {m.status} · {m.since}
                </p>
              </div>
              <Button type="button" variant="outline">
                Open
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
