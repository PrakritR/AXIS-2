"use client";

import { PartnerMeetingScheduler } from "@/components/partner/partner-meeting-scheduler";
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import "@/components/marketing/landing-proplane.css";

export default function BookADemoPage() {
  const { showToast } = useAppUi();

  return (
    <MarketingPageShell>
      <header className="lp-page-hero">
        <div className="lp-w max-w-[560px]">
          <h1 className="lp-page-title lp-page-title-wide">Book a demo</h1>
          <p className="lp-page-lede">
            Pick a time that works — we will walk you through PropLane live.
          </p>
          <div className="mt-6 text-left">
            <PartnerMeetingScheduler showToast={showToast} />
          </div>
        </div>
      </header>
    </MarketingPageShell>
  );
}
