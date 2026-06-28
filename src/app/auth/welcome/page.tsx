"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthChoiceList,
  AuthFooterLink,
  AuthLoadingCard,
  AuthPageHeader,
  AuthRoleCard,
} from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getNativeInfo } from "@/lib/native/push-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  {
    href: "/auth/resident",
    label: "Resident",
    hint: "Apply, pay rent, track move-in",
    icon: "resident" as const,
    tone: "blue" as const,
  },
  {
    href: "/auth/manager",
    label: "Property manager",
    hint: "Listings, leases, residents",
    icon: "manager" as const,
    tone: "steel" as const,
  },
];

export default function AuthWelcomePage() {
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
      <AuthPageHeader title="Welcome" subtitle="How will you use Axis?" />

      <AuthChoiceList>
        {ROLE_OPTIONS.map((option) => (
          <AuthRoleCard
            key={option.href}
            label={option.label}
            hint={option.hint}
            icon={option.icon}
            tone={option.tone}
            onClick={() => router.push(option.href)}
          />
        ))}
      </AuthChoiceList>

      <AuthFooterLink href="/auth/sign-in">Already signed in?</AuthFooterLink>
    </AuthCard>
  );
}
