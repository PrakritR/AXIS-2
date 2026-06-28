"use client";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthFooterLink,
  AuthLoadingCard,
  AuthPageHeader,
  AuthRoleTabs,
} from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getNativeInfo } from "@/lib/native/push-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  {
    id: "/auth/resident",
    label: "Resident",
    hint: "Rent & apply",
    icon: "resident" as const,
    tone: "blue" as const,
  },
  {
    id: "/auth/manager",
    label: "Manager",
    hint: "List & lease",
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

      <AuthRoleTabs
        options={ROLE_OPTIONS}
        onSelect={(href) => router.push(href)}
      />

      <AuthFooterLink href="/auth/sign-in">Sign in</AuthFooterLink>
    </AuthCard>
  );
}
