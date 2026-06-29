"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { MobileEmailSignIn } from "@/components/auth/mobile-email-sign-in";
import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import {
  AuthAccountFooterLink,
  AuthDivider,
  AuthPageHeader,
} from "@/components/auth/auth-mobile-primitives";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function ManagerAuthWeb() {
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

      <AuthAccountFooterLink href="/auth/sign-in?mode=create&role=manager">
        New here? Create an account
      </AuthAccountFooterLink>
      <AuthAccountFooterLink href="/auth/sign-in">Change role</AuthAccountFooterLink>
    </AuthCard>
  );
}

export default function ManagerAuthPage() {
  const router = useRouter();

  useEffect(() => {
    if (detectNativePlatformSync()) {
      router.replace("/auth/sign-in?mode=sign-in&role=manager");
    }
  }, [router]);

  if (detectNativePlatformSync()) {
    return <NativeAuthHub />;
  }

  return <ManagerAuthWeb />;
}
