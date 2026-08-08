import type { Metadata } from "next";
import { MobileAppDownloadPanel } from "@/components/marketing/ios-app-download-panel";
import { MarketingPageShell, MarketingSection } from "@/components/marketing/marketing-page-shell";
import "@/components/marketing/landing-proplane.css";

export const metadata: Metadata = {
  title: "PropLane mobile app",
  description: "Download the PropLane mobile app for property management on your phone.",
};

export default function MobileAppDownloadPage() {
  return (
    <MarketingPageShell>
      <MarketingSection narrow className="pb-16 pt-10 sm:pt-14">
        <MobileAppDownloadPanel />
      </MarketingSection>
    </MarketingPageShell>
  );
}
