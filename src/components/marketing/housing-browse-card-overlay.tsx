import type { PropertyBrowseCard } from "@/lib/room-listings-catalog";

/** Keeps carousel/swipe rows aligned when neighborhood is missing from listing data. */
export function browseCardNeighborhoodLine(card: PropertyBrowseCard): string {
  return card.neighborhood.trim() || "\u00a0";
}

type HousingBrowseCardOverlayProps = {
  card: PropertyBrowseCard;
  rent: string;
  periodLabel: string;
  layout: "carousel" | "compact" | "swipe";
};

export function HousingBrowseCardOverlay({
  card,
  rent,
  periodLabel,
  layout,
}: HousingBrowseCardOverlayProps) {
  const isCarousel = layout === "carousel";
  const isSwipe = layout === "swipe";
  const showMeta = isCarousel || isSwipe;

  const padding = isSwipe
    ? "px-5 pb-5 pt-14"
    : isCarousel
      ? "px-4 pb-4 pt-10 sm:px-5 sm:pb-5 sm:pt-12"
      : "p-3 sm:p-3.5";

  if (layout === "compact") {
    return (
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent ${padding}`}>
        <p className="text-lg font-bold tracking-tight text-white sm:text-xl">{rent}</p>
        <p className="text-[11px] font-medium text-white/75 sm:text-xs">{periodLabel}</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
      <div className={padding}>
        {showMeta ? (
          <>
            <p className="line-clamp-1 min-h-5 text-sm font-semibold leading-5 text-white/90">
              {browseCardNeighborhoodLine(card)}
            </p>
            <p
              className={
                isSwipe
                  ? "mt-0.5 line-clamp-2 text-xl font-bold leading-snug tracking-tight text-white"
                  : "mt-0.5 line-clamp-2 text-base font-semibold leading-snug text-white"
              }
            >
              {card.headlineAddress}
            </p>
          </>
        ) : null}
        <p
          className={`font-bold tracking-tight text-white ${
            isCarousel ? "mt-2 text-2xl sm:text-3xl" : "mt-2 text-2xl"
          }`}
        >
          {rent}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-white/75 sm:text-xs">{periodLabel}</p>
      </div>
    </div>
  );
}
