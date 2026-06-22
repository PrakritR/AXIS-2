import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { LandingHero } from "@/components/marketing/landing-hero";
import {
  LandingAudienceBento,
  LandingFinalCta,
  LandingHowItWorks,
} from "@/components/marketing/landing-sections";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <div className="hero-chrome-scene relative overflow-hidden">
        <ChromeSubstrate variant="full" />
        <LandingHero />
      </div>

      <LandingAudienceBento />
      <LandingHowItWorks />
      <LandingFinalCta />
    </div>
  );
}
