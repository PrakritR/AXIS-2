import type { Metadata } from "next";
import { MobileAppDownloadPanel } from "@/components/marketing/ios-app-download-panel";
import { MarketingPageShell, MarketingSection } from "@/components/marketing/marketing-page-shell";
import Link from "next/link";
import "@/components/marketing/landing-proplane.css";

export const metadata: Metadata = {
  title: "PropLane mobile app",
  description:
    "Download the PropLane mobile app for push notifications, inbox messaging, and property management on your phone.",
};

export default function MobileAppDownloadPage() {
  return (
    <MarketingPageShell>
      <MarketingSection narrow className="pb-16 pt-10 sm:pt-14">
        <MobileAppDownloadPanel />
        <p className="mt-8 text-center text-sm text-[var(--lp-muted-fg)]">
          Already managing properties?{" "}
          <Link
            href="/auth/sign-in"
            className="font-semibold text-[var(--lp-brand)] hover:underline"
            data-attr="mobile-app-page-sign-in"
          >
            Sign in on the web
          </Link>{" "}
          or open the{" "}
          <Link href="/portal/app" className="font-semibold text-[var(--lp-brand)] hover:underline">
            App
          </Link>{" "}
          tab after you sign in to the manager portal.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  );
}
