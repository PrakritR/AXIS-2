import { HomeEdgePanel } from "@/components/layout/home-edge-panel";
import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* Radial glow behind hero */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,122,255,0.09) 0%, transparent 70%)",
        }}
      />

      <div className="relative px-4 pb-24 pt-14 sm:pb-28 sm:pt-24 md:pt-28">
        <div className="mx-auto max-w-5xl text-center">
          {/* Eyebrow */}
          <div className="animate-fade-up mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1.5 sm:mb-6 sm:px-4">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-xs font-semibold tracking-wide text-primary sm:text-[13px]">
              Axis · Rooms for rent
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up mx-auto max-w-3xl text-[2.25rem] font-semibold leading-[1.1] text-slate-950 sm:text-[3.75rem] sm:leading-[1.08] md:text-[4.5rem]"
            style={{ animationDelay: "60ms" }}
          >
            Find a room that{" "}
            <span
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-alt) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              works for you
            </span>
          </h1>

          {/* Search card */}
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
