"use client";

import { PortalAuthForm } from "@/components/auth/portal-auth-form";
import { ResidentSignupBlocked } from "@/components/auth/resident-signup-blocked";
import { AuthCard } from "@/components/auth/auth-card";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Unified create-account surface.
 * Default path: role-agnostic account creation, then `/auth/get-started` for
 * resident / manager / vendor. Legacy `axis_id` links keep `ResidentSignupBlocked`
 * (emailed setup-token handoff). Manager checkout `session_id` uses CreateAccountClient.
 */
export default function CreateAccountRouter() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const axisId = searchParams.get("axis_id")?.trim() ?? "";
  const tourInquiryId = searchParams.get("tour_inquiry")?.trim() ?? "";
  const prospectHandoff = searchParams.get("handoff")?.trim() === "message";

  if (sessionId || tourInquiryId || prospectHandoff) {
    return <CreateAccountClient />;
  }

  if (axisId) {
    return (
      <AuthCard>
        <ResidentSignupBlocked />
      </AuthCard>
    );
  }

  return <PortalAuthForm mode="create" variant="hub" />;
}
