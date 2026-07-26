"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { ResidentSignupBlocked } from "@/components/auth/resident-signup-blocked";
import { AuthCard } from "@/components/auth/auth-card";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Unified create-account surface.
 * Generic resident create-account (`role=resident`, no legacy `axis_id`) routes to
 * the enabled `ResidentSignupForm` via `NativeAuthHub` — an anonymous visitor
 * self-serves a resident account; a signed-in manager/vendor is offered the
 * additive path instead. Legacy `axis_id` links keep `ResidentSignupBlocked`
 * (they complete an emailed setup-token handoff). Manager checkout `session_id`
 * still uses CreateAccountClient.
 */
export default function CreateAccountRouter() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const axisId = searchParams.get("axis_id")?.trim() ?? "";

  if (sessionId) {
    return <CreateAccountClient />;
  }

  // Legacy resident links that pinned an Axis ID keep the setup-link message
  // (that flow completes an emailed handoff). Generic resident signup now goes
  // to the unified hub, which renders the resident create-account form.
  if (axisId) {
    return (
      <AuthCard>
        <ResidentSignupBlocked />
      </AuthCard>
    );
  }

  return <NativeAuthHub defaultMode="create" />;
}
