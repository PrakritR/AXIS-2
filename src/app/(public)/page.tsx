import { LandingAudienceGrid } from "@/components/marketing/landing-audience-grid";
import { LandingDemoHero } from "@/components/marketing/landing-demo-hero";
import { LandingHero } from "@/components/marketing/landing-hero";
import { isPublicDemoSurfaceEnabled } from "@/lib/public-demo-access";

export default function HomePage() {
  // Demo-first landing. If the public demo surface is disabled for this
  // deployment, fall back to the classic hero + audience grid.
  if (!isPublicDemoSurfaceEnabled()) {
    return (
      <div className="relative min-h-0 flex-1">
        <LandingHero />
        <LandingAudienceGrid />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <LandingDemoHero />
    </div>
  );
}
