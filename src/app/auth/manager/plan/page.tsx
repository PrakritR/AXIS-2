"use client";

import { ManagerPlanPicker } from "@/components/auth/manager-plan-picker";
import { NativeManagerPlanRedirect } from "@/components/auth/native-manager-plan-redirect";

/**
 * Manager plan picker (Free/Pro/Business subscription). On native iOS this
 * subscription-purchase surface is not shown (App Store Guideline 2.1(b)): the
 * picker is hidden flash-free via `.native-hide` (data-native is set in <head>)
 * and native users are redirected away by NativeManagerPlanRedirect. Web is
 * unchanged.
 */
export default function ManagerPlanPage() {
  return (
    <>
      <div className="native-hide">
        <ManagerPlanPicker />
      </div>
      <div className="native-only">
        <NativeManagerPlanRedirect />
      </div>
    </>
  );
}
