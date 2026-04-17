import { PropertyCard } from "@/components/marketing/property-card";
import { Toolbar } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { mockProperties } from "@/data/mock-properties";

export default function ListingsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Listings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Available homes (mock)</h1>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Filters are visual-only. Cards reuse the same component as the homepage.
      </p>

      <Toolbar>
        <Input className="md:max-w-md" placeholder="Search neighborhood, address, keyword…" />
        <Select className="md:max-w-xs">
          <option>Any price</option>
          <option>Under $1,000</option>
          <option>$1,000 – $1,400</option>
          <option>$1,400+</option>
        </Select>
        <Button type="button" variant="outline">
          More filters
        </Button>
      </Toolbar>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {mockProperties.map((p) => (
          <PropertyCard key={p.id} property={p} />
        ))}
      </div>
    </div>
  );
}
