import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEMO_MANAGER_PROFILE_EMAIL } from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

export function ManagerProfile() {
  return (
    <ManagerSectionShell
      title="Profile"
      actions={[{ label: "Edit", variant: "outline" }]}
    >
      <Card className="rounded-3xl border border-slate-200/80 p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Full name</label>
            <Input value="-" readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Email</label>
            <Input value={DEMO_MANAGER_PROFILE_EMAIL} readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Phone</label>
            <Input value="-" readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Manager ID</label>
            <Input value="-" readOnly />
          </div>
        </div>
      </Card>
    </ManagerSectionShell>
  );
}

