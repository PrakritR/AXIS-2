import { LandingDemoHero } from "@/components/marketing/landing-demo-hero";
import { LandingHomeSections } from "@/components/marketing/landing-home-sections";
import "@/components/marketing/landing-proplane.css";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      {/* Theme-aware hero — light blue / dark purple brand split */}
      <LandingDemoHero />
      {/* Full-flow sections: cool white (light) / near-black (dark); brand via --pl-brand */}
      <div className="lp-root">
        <LandingHomeSections />
      </div>
    </div>
  );
}
