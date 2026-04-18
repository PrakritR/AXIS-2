import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell } from "./manager-section-shell";

const propertyCards = [
  { name: "Pioneer Heights", units: "12 beds linked", occupancy: "View only", leasing: "Manager-led", note: "Jordan Lee" },
  { name: "Marina Commons", units: "8 beds linked", occupancy: "View only", leasing: "Manager-led", note: "Sam Rivera" },
];

export function OwnerProperties() {
  return (
    <ManagerSectionShell
      eyebrow="Portfolio"
      title="Properties"
      subtitle="All buildings linked to your owner account. Operational approvals and edits stay with your property manager."
      actions={[{ label: "Refresh (demo)", variant: "primary" }]}
    >
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        Owner view is <strong>read-only</strong> for leasing actions (approve applications, post listings, etc.). Use your
        manager tab to see who operates each site.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {propertyCards.map((property) => (
          <Card key={property.name} className="relative p-5 opacity-95">
            <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-b from-transparent to-slate-50/30" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">Linked property</p>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{property.name}</h2>
            <p className="mt-1 text-sm text-slate-600">Manager: {property.note}</p>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-4">
                <dt>Inventory</dt>
                <dd className="font-semibold text-slate-900">{property.units}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Your access</dt>
                <dd className="font-semibold text-slate-900">{property.occupancy}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Leasing</dt>
                <dd className="font-semibold text-slate-900">{property.leasing}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled className="cursor-not-allowed opacity-60">
                Approve changes
              </Button>
              <Button type="button" variant="outline" disabled className="cursor-not-allowed opacity-60">
                Post listing
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
