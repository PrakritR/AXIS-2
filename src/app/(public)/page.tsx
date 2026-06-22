import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { HomeEdgePanel } from "@/components/layout/home-edge-panel";
import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export default function HomePage() {
  return (
    <div className="hero-chrome-scene relative min-h-0 flex-1 overflow-hidden">
      <ChromeSubstrate variant="full" />

      <div className="relative px-4 pb-24 pt-14 sm:pb-28 sm:pt-20 md:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="hero-eyebrow animate-fade-up mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md sm:mb-6 sm:px-4">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--steel-light)] shadow-[0_0_10px_rgba(188,212,255,0.9)]" />
            <span className="text-xs font-semibold tracking-wide sm:text-[13px]">
              Axis · Rooms for rent
            </span>
          </div>

          <h1
            className="hero-title animate-fade-up mx-auto max-w-3xl text-[2.25rem] font-semibold leading-[1.1] sm:text-[3.75rem] sm:leading-[1.08] md:text-[4.5rem]"
            style={{ animationDelay: "60ms" }}
          >
            Find a room that{" "}
            <span className="text-gradient-accent">works for you</span>
          </h1>

          <p
            className="hero-subtitle animate-fade-up mx-auto mt-5 max-w-xl text-base leading-relaxed sm:text-lg"
            style={{ animationDelay: "90ms" }}
          >
            Browse rooms by move-in date, budget, and neighborhood — apply and tour without the back-and-forth.
          </p>

          <div
            className="animate-fade-up mx-auto mt-10 max-w-[1060px] sm:mt-12"
            style={{ animationDelay: "120ms" }}
          >
            <HomeHeroSearch />
          </div>
        </div>
      </div>

      <HomeEdgePanel />
    </div>
  );
}
