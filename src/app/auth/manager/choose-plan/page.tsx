"use client";

import { ManagerEntryPlanChooser } from "@/components/auth/manager-entry-plan-chooser";
import { NativeManagerPlanRedirect } from "@/components/auth/native-manager-plan-redirect";

/**
 * Portal-entry plan chooser: the step right after a signed-in user picks
 * "Property Manager" on /auth/get-started. On native iOS this
 * subscription-purchase surface is not shown (App Store Guideline 2.1(b)):
 * hidden flash-free via `.native-hide` and native users are redirected into the
 * portal by NativeManagerPlanRedirect — the in-app IAP surface in Settings is
 * the native purchase path. Web is the Stripe flow.
 */
export default function ManagerChoosePlanPage() {
  return (
    <>
      <div className="native-hide">
        <ManagerEntryPlanChooser />
      </div>
      <div className="native-only">
        <NativeManagerPlanRedirect />
      </div>
    </>
  );
}
