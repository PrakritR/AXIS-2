import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { LandingHero } from "@/components/marketing/landing-hero";
import {
  LandingAudienceBento,
  LandingFinalCta,
  LandingHowItWorks,
} from "@/components/marketing/landing-sections";
import { ProductPreviewShell } from "@/components/marketing/product-preview-shell";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <div className="hero-chrome-scene relative overflow-hidden">
        <ChromeSubstrate variant="full" />
        <LandingHero />
      </div>

      <RevealOnView className="relative -mt-4 pb-16 pt-8 sm:-mt-6 sm:pb-20 sm:pt-10">
        <ProductPreviewShell mode="static" scene="manager" />
      </RevealOnView>

      <LandingAudienceBento />
      <LandingHowItWorks />
      <LandingFinalCta />
    </div>
  );
}
