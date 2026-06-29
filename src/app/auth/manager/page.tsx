"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MobileEmailSignIn } from "@/components/auth/mobile-email-sign-in";
import {
  AuthDivider,
  AuthFooterLink,
  AuthPageHeader,
} from "@/components/auth/auth-mobile-primitives";
import Link from "next/link";

export default function ManagerAuthPage() {
  return (
    <AuthCard>
      <AuthPageHeader
        showLogo
        eyebrow="Manager"
        title="Sign in"
        subtitle="Or create a new account below"
        accent={false}
      />

      <div className="mt-5">
        <GoogleSignInButton nextPath="/portal/dashboard" />
      </div>

      <div className="my-4">
        <AuthDivider />
      </div>

      <MobileEmailSignIn nextPath="/portal/dashboard" />

      <p className="auth-footer-link mt-5 text-center text-[13px] text-muted">
        New here?{" "}
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/manager/plan">
          Choose a plan
        </Link>
      </p>

      <AuthFooterLink href="/auth/welcome">Change role</AuthFooterLink>
    </AuthCard>
  );
}
