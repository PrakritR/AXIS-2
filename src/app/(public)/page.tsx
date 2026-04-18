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

      <div className="relative px-4 pb-28 pt-20 sm:pt-28 md:pt-32">
        <div className="mx-auto max-w-5xl text-center">
          {/* Eyebrow */}
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-[#007aff]/20 bg-[#007aff]/[0.07] px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#007aff]" />
            <span className="text-[13px] font-semibold tracking-wide text-[#007aff]">
              Axis Housing · Now Leasing
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up mx-auto max-w-3xl text-[3rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#1d1d1f] sm:text-[3.75rem] md:text-[4.5rem]"
            style={{ animationDelay: "60ms" }}
          >
            Find housing that{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #007aff 0%, #339cff 100%)",
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
