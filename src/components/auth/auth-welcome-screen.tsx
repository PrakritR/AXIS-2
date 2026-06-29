"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthBrandHeader,
  AuthFooterLink,
  AuthLoadingCard,
  AuthRoleStack,
} from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { getNativeInfo } from "@/lib/native/push-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const AUTH_WELCOME_ROLE_OPTIONS = [
  {
    id: "/auth/resident",
    label: "Resident",
    hint: "Rent, pay & apply",
    icon: "resident" as const,
    tone: "blue" as const,
  },
  {
    id: "/auth/manager",
    label: "Manager",
    hint: "List properties & lease",
    icon: "manager" as const,
    tone: "steel" as const,
  },
] as const;

/** Native app lands on /auth/sign-in (always deployed) and shows welcome when no intent. */
export function shouldShowNativeWelcome(search: {
  intent: string | null;
  next: string | null;
  error: string | null;
}): boolean {
  if (!detectNativePlatformSync()) return false;
  if (search.intent === "resident" || search.intent === "manager") return false;
  if (search.next?.trim()) return false;
  if (search.error) return false;
  return true;
}

type AuthWelcomeScreenProps = {
  /** Web /auth/welcome — link to email sign-in. Hidden when welcome is embedded in /auth/sign-in. */
  showWebSignInLink?: boolean;
};

export function AuthWelcomeScreen({ showWebSignInLink = false }: AuthWelcomeScreenProps) {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { isNative } = await getNativeInfo();
        if (!isNative) return;
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session) {
          window.location.replace("/auth/continue");
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checkingSession) {
    return (
      <AuthCard>
        <AuthLoadingCard />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthBrandHeader title="Welcome" subtitle="Choose how you'll use Axis" />

      <AuthRoleStack
        options={[...AUTH_WELCOME_ROLE_OPTIONS]}
        onSelect={(href) => router.push(href)}
      />

      {showWebSignInLink ? (
        <AuthFooterLink href="/auth/sign-in">Already have an account? Sign in</AuthFooterLink>
      ) : (
        <p className="auth-native-email-sign-in mt-4 text-center text-[13px] text-muted sm:mt-5">
          <Link className="font-semibold text-primary hover:opacity-90" href="/auth/sign-in?intent=resident">
            Sign in with email
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
