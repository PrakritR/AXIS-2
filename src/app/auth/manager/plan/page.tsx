"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthLoadingCard } from "@/components/auth/auth-mobile-primitives";
import { ManagerPlanPicker } from "@/components/auth/manager-plan-picker";
import { NativeManagerPlanRedirect } from "@/components/auth/native-manager-plan-redirect";
import { useIsNativeApp } from "@/hooks/use-is-native-app";

export default function ManagerPlanPage() {
  const { isNative } = useIsNativeApp();

  if (isNative === null) {
    return (
      <AuthCard>
        <AuthLoadingCard />
      </AuthCard>
    );
  }

  if (isNative) {
    return <NativeManagerPlanRedirect />;
  }

  return <ManagerPlanPicker />;
}
