import { HomeEdgePanel } from "@/components/layout/home-edge-panel";
import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <div className="relative overflow-hidden pb-20 pt-10 sm:pt-14 md:pt-16">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h1 className="text-[2.1rem] font-semibold leading-[1.15] tracking-tight text-slate-900 sm:text-4xl md:text-[2.75rem]">
            Find housing that works for you
          </h1>

          <div className="mx-auto mt-10 max-w-[1100px] sm:mt-12">
            <HomeHeroSearch />
          </div>

          <p className="mx-auto mt-6 max-w-2xl text-center font-mono text-xs text-red-600">
            column properties.listing_status does not exist
          </p>
        </div>
      </div>

      <HomeEdgePanel />
    </div>
  );
}
