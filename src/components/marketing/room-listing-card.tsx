import Link from "next/link";
import type { RoomListingRow } from "@/lib/room-listings-catalog";

export function RoomListingCard({ row }: { row: RoomListingRow }) {
  const href = `/rent/listings/${row.propertyId}`;
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="aspect-[4/3] w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 sm:w-28" />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{row.streetUpper}</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">{row.title}</p>
          <p className="mt-2 text-base font-bold text-primary">{row.priceLabel}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">{row.availabilityLabel}</p>
          <p className="mt-1.5 text-xs leading-snug text-slate-500">{row.bathroomHint}</p>
        </div>
      </div>
    </Link>
  );
}
