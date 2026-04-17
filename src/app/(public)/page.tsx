import { HomeEdgePanel } from "@/components/layout/home-edge-panel";
import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="relative overflow-hidden pb-20 pt-10 sm:pt-14 md:pt-16"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -10%, rgba(191, 219, 254, 0.55) 0%, rgba(248, 250, 252, 0.95) 45%, #f8fafc 100%)",
        }}
      >
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h1 className="font-serif text-[2.35rem] font-normal leading-[1.12] tracking-tight text-slate-900 sm:text-5xl md:text-[3.25rem]">
            Find housing that works for you
          </h1>

          <div className="mx-auto mt-12 max-w-4xl">
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
