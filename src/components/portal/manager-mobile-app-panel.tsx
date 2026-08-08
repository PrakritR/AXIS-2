"use client";

import { MobileAppDownloadPanel } from "@/components/marketing/ios-app-download-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";

/** Manager portal → App tab: download the PropLane mobile app. */
export function ManagerMobileAppPanel() {
  return (
    <ManagerPortalPageShell title="App">
      <MobileAppDownloadPanel showPortalLink={false} />
    </ManagerPortalPageShell>
  );
}
