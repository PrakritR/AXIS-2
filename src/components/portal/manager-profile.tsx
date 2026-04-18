import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ManagerSectionShell } from "./manager-section-shell";

export function ManagerProfile() {
  return (
    <ManagerSectionShell eyebrow="Account" title="Profile" subtitle="Manage your account details.">
      <Card className="p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Profile</h2>
          <Button type="button" variant="outline" className="min-h-[52px] rounded-[22px] px-8 text-base">
            Edit info
          </Button>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Full name</label>
            <Input value="-" readOnly />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Email</label>
            <Input value="prakritramachandran@gmail.com" readOnly />
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
