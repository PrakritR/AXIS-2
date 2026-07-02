import { AuthCard } from "@/components/auth/auth-card";
import { AuthLoadingCard } from "@/components/auth/auth-mobile-primitives";
import { PortalAuthForm } from "@/components/auth/portal-auth-form";
import { Suspense } from "react";

/** The single portal sign-in screen for every account type (web + native). */
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <AuthLoadingCard />
        </AuthCard>
      }
    >
      <PortalAuthForm mode="sign-in" />
    </Suspense>
  );
}
