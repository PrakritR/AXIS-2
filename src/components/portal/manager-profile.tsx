import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ManagerSectionShell } from "./manager-section-shell";

export function ManagerProfile() {
  return (
    <ManagerSectionShell
      eyebrow="Account"
      title="Profile"
      subtitle="Your manager identity, notification defaults, and portfolio preferences live here."
      actions={[
        { label: "Save changes" },
        { label: "Preview portal", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Manager details</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800">Full name</label>
              <Input defaultValue="Taylor Brooks" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800">Email</label>
              <Input defaultValue="taylor@axishousing.demo" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800">Phone</label>
              <Input defaultValue="(206) 555-0146" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800">Default market</label>
              <Select defaultValue="seattle">
                <option value="seattle">Seattle</option>
                <option value="phoenix">Phoenix</option>
                <option value="chicago">Chicago</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Notification rules</p>
          <div className="mt-5 space-y-4">
            {[
              "Email me when a new application arrives",
              "Text me when a high-priority work order is opened",
              "Daily digest for unpaid balances",
            ].map((label, index) => (
              <label key={label} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <input type="checkbox" defaultChecked={index !== 2} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#007aff]" />
                <span className="text-sm font-medium text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>
    </ManagerSectionShell>
  );
}
