"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { ResidentSignupBlocked } from "@/components/auth/resident-signup-blocked";
import { AuthCard } from "@/components/auth/auth-card";
import { useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * Unified create-account surface.
 * Resident self-serve signup is blocked — accounts come from emailed setup links.
 * Legacy manager checkout session_id still uses CreateAccountClient.
 */
export default function CreateAccountRouter() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const role = searchParams.get("role")?.trim().toLowerCase() ?? "";
  const axisId = searchParams.get("axis_id")?.trim() ?? "";

  if (sessionId) {
    return <CreateAccountClient />;
  }

  // Old resident create-account links (with or without axis_id) → setup-link message.
  if (role === "resident" || axisId) {
    return (
      <AuthCard>
        <ResidentSignupBlocked />
      </AuthCard>
    );
  }

  return <NativeAuthHub defaultMode="create" />;
}
