import { HomeEdgePanel } from "@/components/layout/home-edge-panel";
import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1 bg-gradient-to-b from-[#eef2ff] via-[#f3f6ff] to-[#f8fafc]">
      <div className="relative overflow-hidden pb-24 pt-14 sm:pt-20 md:pt-24">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h1 className="text-[2.6rem] font-bold leading-[1.1] tracking-tight text-[#0d1f4e] sm:text-5xl md:text-[3.25rem]">
            Find housing that works for you
          </h1>

          <div className="mx-auto mt-10 max-w-[1060px] sm:mt-14">
            <HomeHeroSearch />
          </div>
        </div>
      </div>

      <HomeEdgePanel />
    </div>
  );
}
