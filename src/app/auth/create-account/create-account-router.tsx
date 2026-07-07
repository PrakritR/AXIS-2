"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Unified create-account surface for all roles (resident, manager, vendor) via NativeAuthHub.
 * Legacy post-payment links carrying checkout session_id / resident axis_id still use CreateAccountClient.
 */
export default function CreateAccountRouter() {
  const searchParams = useSearchParams();
  const hasLegacyContext =
    Boolean(searchParams.get("session_id")?.trim()) || Boolean(searchParams.get("axis_id")?.trim());

  if (hasLegacyContext) {
    return <CreateAccountClient />;
  }
  return <NativeAuthHub defaultMode="create" />;
}
