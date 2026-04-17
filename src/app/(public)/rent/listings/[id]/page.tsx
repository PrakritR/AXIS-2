import { PropertyDetailActions } from "@/components/marketing/property-detail-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { mockProperties } from "@/data/mock-properties";
import { notFound } from "next/navigation";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = mockProperties.find((p) => p.id === id);
  if (!property) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="aspect-[4/3] rounded-3xl border border-border bg-gradient-to-br from-slate-100 to-slate-200" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-2xl border border-border bg-slate-100"
              />
            ))}
          </div>
        </div>

        <div>
          <Badge tone="info">{property.neighborhood}</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{property.title}</h1>
          <p className="mt-2 text-sm text-muted">{property.address}</p>
          <p className="mt-4 text-3xl font-semibold">{property.rentLabel}</p>
          <p className="mt-2 text-sm text-muted">Available: {property.available}</p>

          <div className="mt-8">
            <PropertyDetailActions propertyId={property.id} />
          </div>

          <Card className="mt-8 p-6">
            <CardHeader title="Room information" subtitle="Bed/bath counts are illustrative." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-slate-50 p-4">
                <p className="text-xs font-semibold text-muted">Bedrooms</p>
                <p className="mt-1 text-lg font-semibold">{property.beds}</p>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 p-4">
                <p className="text-xs font-semibold text-muted">Bathrooms</p>
                <p className="mt-1 text-lg font-semibold">{property.baths}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <CardHeader title="Amenities" subtitle="Icon row placeholders." />
          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li>High-speed internet</li>
            <li>In-unit laundry (select units)</li>
            <li>Bike storage</li>
            <li>Rooftop / courtyard (property dependent)</li>
          </ul>
        </Card>
        <Card className="p-6">
          <CardHeader title="Rent summary" subtitle="Charges shown are mock." />
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Base rent</span>
              <span className="font-semibold">{property.rentLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Utilities estimate</span>
              <span className="font-semibold">$95 / mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Parking (optional)</span>
              <span className="font-semibold">$125 / mo</span>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <CardHeader title="Map" subtitle="Mapbox/Google embed will go here." />
          <div className="mt-4 h-44 rounded-2xl border border-dashed border-border bg-slate-50" />
        </Card>
      </div>
    </div>
  );
}
