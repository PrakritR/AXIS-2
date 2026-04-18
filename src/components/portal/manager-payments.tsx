import { Card } from "@/components/ui/card";
import { ManagerSectionShell } from "./manager-section-shell";

const metrics = [
  { label: "Collected this month", value: "$48,360", hint: "96% of billed rent" },
  { label: "Outstanding", value: "$1,920", hint: "4 households need follow-up" },
  { label: "AutoPay enabled", value: "22", hint: "Of 31 active households" },
];

const activity = [
  { resident: "Noah Rivera", type: "Rent reminder", amount: "$1,200", detail: "Scheduled for 2:00 PM" },
  { resident: "Sofia Nguyen", type: "Security deposit", amount: "$750", detail: "Paid via ACH" },
  { resident: "Lila Chen", type: "Late fee waiver", amount: "$35", detail: "Pending approval" },
];

export function ManagerPayments() {
  return (
    <ManagerSectionShell
      eyebrow="Billing"
      title="Payments"
      subtitle="Keep billing operations visible, from reminders and waivers to incoming rent activity."
      actions={[
        { label: "Send reminder" },
        { label: "Export ledger", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-600">{metric.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Recent activity</p>
        <div className="mt-4 space-y-3">
          {activity.map((item) => (
            <div key={item.resident + item.type} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.resident}</p>
                <p className="mt-1 text-sm text-slate-600">{item.type}</p>
              </div>
              <div className="text-sm font-semibold text-slate-900">{item.amount}</div>
              <div className="text-sm text-slate-500">{item.detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </ManagerSectionShell>
  );
}
