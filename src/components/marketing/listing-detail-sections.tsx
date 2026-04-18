import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MockProperty } from "@/data/types";
import type {
  AmenityItem,
  BundleCard,
  LeaseBasicRow,
  ListingBathroomRow,
  ListingFloorCard,
  ListingRichContent,
  ListingRoomRow,
  ListingSharedRow,
} from "@/data/listing-rich-content";
import { PropertyDetailActions } from "@/components/marketing/property-detail-actions";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "listing-bathrooms", label: "Bathrooms" },
  { id: "listing-shared", label: "Shared spaces" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "location", label: "Location" },
];

function ListingSubnav() {
  return (
    <nav className="sticky top-14 z-20 -mx-4 border-b border-slate-200/80 bg-[#f4f7fb]/95 px-2 py-2 backdrop-blur-md sm:-mx-0 sm:top-16 sm:rounded-2xl sm:border sm:px-3 sm:py-3">
      <ul className="-mx-1 flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 py-1 text-[13px] font-semibold text-slate-600 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {nav.map((item) => (
          <li key={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              className="inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-slate-600 transition hover:bg-white hover:text-primary sm:min-h-0 sm:py-1.5"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AvailabilityPill({ text }: { text: string }) {
  const green = text.toLowerCase().includes("available");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        green ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${green ? "bg-emerald-500" : "bg-slate-400"}`} />
      {text}
    </span>
  );
}

function DetailsLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/rent/tours-contact"
      className={`inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-primary hover:text-primary sm:min-h-0 ${className}`}
    >
      Details
    </Link>
  );
}

function RoomMobileCards({ rooms }: { rooms: ListingRoomRow[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {rooms.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{r.name}</p>
            <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{r.price}</p>
            <AvailabilityPill text={r.availability} />
          </div>
          <DetailsLink className="mt-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function RoomTableRows({ rooms }: { rooms: ListingRoomRow[] }) {
  return (
    <>
      <RoomMobileCards rooms={rooms} />
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Room</span>
            <span>Price</span>
            <span>Availability</span>
            <span className="w-[88px] text-right sm:text-left" />
          </div>
          {rooms.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-3 border-b border-slate-100 py-4 last:border-0"
            >
              <div>
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
              </div>
              <p className="text-sm font-semibold text-slate-900">{r.price}</p>
              <AvailabilityPill text={r.availability} />
              <DetailsLink />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FloorPlanCard({ floor }: { floor: ListingFloorCard }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{floor.floorLabel}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{floor.fromPrice}</p>
          {floor.remainingNote ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
              {floor.remainingNote}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rooms</p>
          <p className="text-2xl font-bold text-slate-900">{floor.roomCount}</p>
        </div>
      </div>
      <div className="mt-4 md:overflow-x-auto">
        <RoomTableRows rooms={floor.rooms} />
      </div>
      {floor.hiddenRoomNames && floor.hiddenRoomNames.length > 0 ? (
        <details className="group mt-2 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {floor.hiddenRoomNames.length} more room{floor.hiddenRoomNames.length > 1 ? "s" : ""} ↓</span>
            <span className="hidden group-open:inline">Hide extra rooms ↑</span>
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {floor.hiddenRoomNames.map((n) => (
              <li key={n} className="rounded-xl bg-slate-50 px-3 py-2">
                {n}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ListingVideoPlaceholder({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm">▶</span>
        {eyebrow}
      </div>
      <div className="flex aspect-video flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950 px-6 text-center text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 text-2xl text-white/90">
          ▶
        </div>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-white/60">{subtitle}</p>
      </div>
    </div>
  );
}

function BathroomMobileCards({ rows }: { rows: ListingBathroomRow[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <p className="font-semibold text-slate-900">{r.name}</p>
          <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
          <p className="mt-2 text-sm text-slate-700">{r.setup}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AvailabilityPill text={r.availability} />
          </div>
          <DetailsLink className="mt-3 w-full justify-center" />
        </div>
      ))}
    </div>
  );
}

function BathroomTable({ rows }: { rows: ListingBathroomRow[] }) {
  return (
    <>
      <BathroomMobileCards rows={rows} />
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto] gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Bathroom</span>
            <span>Setup</span>
            <span>Availability</span>
            <span className="w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto] items-center gap-3 border-b border-slate-100 py-4 last:border-0"
            >
              <div>
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
              </div>
              <p className="text-sm text-slate-700">{r.setup}</p>
              <AvailabilityPill text={r.availability} />
              <DetailsLink />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SharedMobileCards({ rows }: { rows: ListingSharedRow[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <p className="font-semibold text-slate-900">{r.name}</p>
          <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
          <p className="mt-2 text-sm text-slate-700">{r.useNote}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AvailabilityPill text={r.availability} />
          </div>
          <DetailsLink className="mt-3 w-full justify-center" />
        </div>
      ))}
    </div>
  );
}

function SharedTable({ rows }: { rows: ListingSharedRow[] }) {
  return (
    <>
      <SharedMobileCards rows={rows} />
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto] gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Space</span>
            <span>Details</span>
            <span>Availability</span>
            <span className="w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto] items-center gap-3 border-b border-slate-100 py-4 last:border-0"
            >
              <div>
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{r.detail}</p>
              </div>
              <p className="text-sm text-slate-700">{r.useNote}</p>
              <AvailabilityPill text={r.availability} />
              <DetailsLink />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LeaseBasicsBlock({ rows }: { rows: LeaseBasicRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Lease basics</h2>
      <ul className="mt-6 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.title} className="flex gap-4 py-5 first:pt-0">
            <span className="text-2xl" aria-hidden>
              {row.icon}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{row.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{row.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AmenitiesBlock({ items }: { items: AmenityItem[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Amenities</h2>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Shared spaces and house features</p>
      <div className="mt-6 grid grid-cols-1 gap-x-12 sm:grid-cols-2">
        {items.map((a) => (
          <div key={a.label} className="flex items-center gap-3 border-b border-slate-100 py-3.5 text-sm text-slate-800">
            <span className="text-lg text-primary" aria-hidden>
              {a.icon}
            </span>
            <span>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBoldSegments(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function BundleCards({ cards, body }: { cards: BundleCard[]; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Bundles & leasing</h2>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Grouped packages</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{c.label}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              {c.strikethrough ? <span className="text-sm text-slate-400 line-through">{c.strikethrough}</span> : null}
              <span className="text-2xl font-bold text-slate-900">{c.price}</span>
              {c.promo ? <span className="text-[11px] font-bold uppercase tracking-wide text-teal-600">{c.promo}</span> : null}
            </div>
            <p className="mt-4 text-sm text-slate-600">{c.roomsLine}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Lease lengths</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{formatBoldSegments(body)}</p>
    </div>
  );
}

const primaryCtaClass =
  "mt-5 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white outline-none transition hover:-translate-y-[1px] active:translate-y-0";
const primaryCtaStyle = {
  background: "linear-gradient(135deg, #007aff, #339cff)",
  boxShadow: "0 4px 20px rgba(0,122,255,0.3)",
};

function Sidebar({
  property,
  rich,
  className = "",
}: {
  property: MockProperty;
  rich: ListingRichContent;
  className?: string;
}) {
  const rent = property.rentLabel.replace(/\s*\/\s*mo.*$/i, "").trim();
  return (
    <aside className={`order-1 space-y-6 lg:order-2 lg:sticky lg:top-24 lg:self-start ${className}`}>
      <Card className="p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Starting from</p>
        <p className="mt-1 text-4xl font-bold text-primary">{rent}</p>
        <p className="text-sm text-slate-500">per month</p>
        <Link href="/rent/tours-contact" className={`${primaryCtaClass} min-h-[48px]`} style={primaryCtaStyle}>
          Check availability
        </Link>
        <Link
          href="/rent/apply"
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-full border border-black/[0.1] bg-white/80 py-3 text-sm font-semibold text-[#1d1d1f] outline-none transition hover:bg-black/[0.04]"
        >
          Apply online
        </Link>
      </Card>
      <Card className="p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Quick facts</p>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {rich.quickFacts.map((q) => (
            <li key={q.label} className="flex justify-between gap-4 py-3 first:pt-0">
              <span className="text-slate-500">{q.label}</span>
              <span className="font-semibold text-slate-900">{q.value}</span>
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  );
}

export function ListingDetailSections({ property, rich }: { property: MockProperty; rich: ListingRichContent }) {
  const roomCount = rich.floorPlans.reduce(
    (n, f) => n + f.rooms.length + (f.hiddenRoomNames?.length ?? 0),
    0,
  );
  return (
    <div className="bg-[#f4f7fb]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {/* Hero gallery */}
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm">
            <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:right-4 sm:top-4 sm:px-3 sm:text-xs">
              1 / 16
            </div>
            <div className="absolute bottom-3 right-3 max-w-[min(100%,14rem)] truncate rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur-sm sm:bottom-4 sm:right-4 sm:max-w-none sm:px-4 sm:py-2 sm:text-sm">
              {rich.priceRangeLabel}
            </div>
            <div className="aspect-[4/3] w-full" />
          </div>
          <div className="grid grid-rows-2 gap-4">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
              <div className="aspect-[16/10] h-full min-h-[120px] w-full lg:aspect-auto lg:min-h-0" />
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
              <div className="aspect-[16/10] h-full min-h-[120px] w-full lg:aspect-auto lg:min-h-0" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge tone="info">{property.neighborhood}</Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">{property.title}</h1>
            <p className="mt-2 text-slate-600">{property.address}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{rich.heroTagline}</p>
            <p className="mt-4 text-sm text-slate-500">
              {property.beds} bed{property.beds !== 1 ? "s" : ""} · {property.baths} bath{property.baths !== 1 ? "s" : ""} · Pet{" "}
              {property.petFriendly ? "friendly" : "ask"}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ListingSubnav />
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_minmax(280px,320px)]">
          <div className="order-2 space-y-14 lg:order-1">
            <section id="floor-plans" className="scroll-mt-36 sm:scroll-mt-32">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Floor plans</h2>
                <p className="text-sm font-medium text-slate-500">{roomCount} rooms listed (demo)</p>
              </div>
              <div className="space-y-6">
                {rich.floorPlans.map((f) => (
                  <FloorPlanCard key={f.floorLabel} floor={f} />
                ))}
              </div>

              <div id="listing-bathrooms" className="scroll-mt-36 sm:scroll-mt-32">
                <div className="mt-14 border-t border-slate-200/80 pt-14">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900">Bathrooms</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Shared and common baths are listed like rooms: setup, availability, and a short tour placeholder you can
                    replace with video when media is ready.
                  </p>
                  <div className="mt-6">
                    <ListingVideoPlaceholder
                      eyebrow="Bathroom walkthrough"
                      title="Video placeholder"
                      subtitle="Hall, full, and powder baths — swap in your hosted tour or Vimeo/YouTube embed."
                    />
                  </div>
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:overflow-x-auto">
                    <BathroomTable rows={rich.bathrooms} />
                  </div>
                </div>
              </div>

              <div id="listing-shared" className="scroll-mt-36 sm:scroll-mt-32">
                <div className="mt-14 border-t border-slate-200/80 pt-14">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900">Shared spaces</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Kitchen, living, and outdoor areas everyone shares. Same table pattern as rooms for consistency; add
                    panoramic or walkthrough video below.
                  </p>
                  <div className="mt-6">
                    <ListingVideoPlaceholder
                      eyebrow="Shared space tour"
                      title="Video placeholder"
                      subtitle="Kitchen, living room, deck — mirror the room tour module from your design system."
                    />
                  </div>
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:overflow-x-auto">
                    <SharedTable rows={rich.sharedSpaces} />
                  </div>
                </div>
              </div>
            </section>

            <section id="lease-basics" className="scroll-mt-36 sm:scroll-mt-32">
              <LeaseBasicsBlock rows={rich.leaseBasics} />
            </section>

            <section id="amenities" className="scroll-mt-36 sm:scroll-mt-32">
              <AmenitiesBlock items={rich.amenities} />
            </section>

            <section id="bundles" className="scroll-mt-36 sm:scroll-mt-32">
              <BundleCards cards={rich.bundleCards} body={rich.bundlesText} />
            </section>

            <section id="location" className="scroll-mt-36 sm:scroll-mt-32">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">Location</h2>
                <div className="mt-4 aspect-[16/9] overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-100">
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Map embed (Mapbox / Google) — {property.address}
                  </div>
                </div>
              </div>
            </section>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-800">Ready to apply?</p>
              <div className="mt-4">
                <PropertyDetailActions propertyId={property.id} />
              </div>
            </div>
          </div>

          <Sidebar property={property} rich={rich} />
        </div>
      </div>
    </div>
  );
}
