"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

export const AUTH_WELCOME_ROLE_OPTIONS = [
  {
    id: "/auth/sign-in?mode=create&role=resident",
    label: "Resident",
    hint: "Rent, pay & apply",
    icon: "resident" as const,
    tone: "blue" as const,
  },
  {
    id: "/auth/sign-in?mode=create&role=manager",
    label: "Manager",
    hint: "List properties & lease",
    icon: "manager" as const,
    tone: "steel" as const,
  },
] as const;

/** Native app lands on /auth/sign-in — unified hub handles welcome + sign-in. */
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
  showWebSignInLink?: boolean;
};

/** @deprecated Prefer NativeAuthHub — kept for /auth/welcome route. */
export function AuthWelcomeScreen(_props: AuthWelcomeScreenProps = {}) {
  return <NativeAuthHub />;
}
