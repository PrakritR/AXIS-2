import { LandingAudienceGrid } from "@/components/marketing/landing-audience-grid";
import { LandingHero } from "@/components/marketing/landing-hero";

export default function HomePage() {
  return (
    <div className="relative min-h-0 flex-1">
      <LandingHero />
      <LandingAudienceGrid />
    </div>
  );
}
