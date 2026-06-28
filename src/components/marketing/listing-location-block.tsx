import { ListingLocationMap } from "@/components/marketing/listing-location-map";

export function ListingLocationBlock({
  lat,
  lng,
  address,
}: {
  lat: number;
  lng: number;
  address: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Location</h2>
      <p className="mt-2 text-sm text-muted">{address}</p>
      <div className="mt-4 overflow-hidden rounded-2xl">
        <ListingLocationMap lat={lat} lng={lng} />
      </div>
    </div>
  );
}
