"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MobileEmailSignIn } from "@/components/auth/mobile-email-sign-in";
import {
  AuthAccountFooterLink,
  AuthDivider,
  AuthPageHeader,
} from "@/components/auth/auth-mobile-primitives";

export default function ManagerAuthPage() {
  return (
    <AuthCard>
      <AuthPageHeader
        showLogo
        eyebrow="Manager"
        title="Sign in"
        subtitle="Property manager portal"
        accent={false}
      />

      <div className="mt-5">
        <GoogleSignInButton nextPath="/portal/dashboard" />
      </div>

      <div className="my-4">
        <AuthDivider />
      </div>

      <MobileEmailSignIn nextPath="/portal/dashboard" />

      <AuthAccountFooterLink href="/auth/manager/plan">New here? Create an account</AuthAccountFooterLink>
      <AuthAccountFooterLink href="/auth/sign-in">Change role</AuthAccountFooterLink>
    </AuthCard>
  );
}
