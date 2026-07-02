"use client";

import { PortalAuthForm } from "@/components/auth/portal-auth-form";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Default sign-up is the unified portal form (email/password + Google, role/plan chosen
 * after auth). The legacy CreateAccountClient is kept ONLY for in-flight post-payment
 * links that still carry a checkout session_id or a resident application axis_id, so any
 * already-issued Stripe/return URLs keep working.
 */
export default function CreateAccountRouter() {
  const searchParams = useSearchParams();
  const hasLegacyContext =
    Boolean(searchParams.get("session_id")?.trim()) || Boolean(searchParams.get("axis_id")?.trim());

  if (hasLegacyContext) {
    return <CreateAccountClient />;
  }
  return <PortalAuthForm mode="create" />;
}
