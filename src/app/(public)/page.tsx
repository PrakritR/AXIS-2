import dynamic from "next/dynamic";
import { HeroChromeSubstrate } from "@/components/brand/hero-chrome-substrate";
import { LandingHero } from "@/components/marketing/landing-hero";

const LandingAudienceBento = dynamic(
  () => import("@/components/marketing/landing-sections").then((m) => ({ default: m.LandingAudienceBento })),
);
const LandingVendorCta = dynamic(
  () => import("@/components/marketing/landing-sections").then((m) => ({ default: m.LandingVendorCta })),
);
const LandingHowItWorks = dynamic(
  () => import("@/components/marketing/landing-sections").then((m) => ({ default: m.LandingHowItWorks })),
);
const LandingFinalCta = dynamic(
  () => import("@/components/marketing/landing-sections").then((m) => ({ default: m.LandingFinalCta })),
);

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <div className="hero-chrome-scene relative overflow-hidden">
        <HeroChromeSubstrate />
        <LandingHero />
      </div>

      <LandingAudienceBento />
      <LandingVendorCta />
      <LandingHowItWorks />
      <LandingFinalCta />
    </div>
  );
}
