"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Default sign-up is the unified auth hub (Manager/Resident + Sign in/Create, Google +
 * email, plan selection all in one place — identical to the native app). The legacy
 * CreateAccountClient is kept ONLY for in-flight post-payment links that still carry a
 * checkout session_id or a resident application axis_id, so already-issued Stripe/return
 * URLs keep working.
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
