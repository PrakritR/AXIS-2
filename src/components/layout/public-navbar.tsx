"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Navbar1, type NavbarMenuItem } from "@/components/ui/navbar1";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Session } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "axis:signed_in";

function readSignedInFromStorage(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(AUTH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistSignedIn(value: boolean) {
  try {
    if (value) localStorage.setItem(AUTH_STORAGE_KEY, "1");
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

export function PublicNavbar() {
  const pathname = usePathname();
  // Always false on server and first client paint so SSR markup matches hydration.
  // Auth state is applied in useEffect after mount (localStorage + Supabase session).
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(readSignedInFromStorage());

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      const isSignedIn = !!result.data.session;
      setSignedIn(isSignedIn);
      persistSignedIn(isSignedIn);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      const isSignedIn = !!session;
      setSignedIn(isSignedIn);
      persistSignedIn(isSignedIn);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const pricingActive = useMemo(
    () => pathname === "/pricing" || pathname.startsWith("/partner/pricing"),
    [pathname],
  );
  const partnerActive = useMemo(
    () => pathname.startsWith("/partner") && !pathname.startsWith("/partner/pricing"),
    [pathname],
  );

  const menu: NavbarMenuItem[] = useMemo(
    () => [
      { title: "Partners", url: "/partner", active: partnerActive },
      { title: "Pricing", url: "/partner/pricing", active: pricingActive },
    ],
    [partnerActive, pricingActive],
  );

  return (
    <div
      id="axis-public-navbar"
      className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top,0px)]"
    >
      <Navbar1
        logoSlot={<AxisLogoLink href="/" size="compact" />}
        menu={menu}
        auth={{
          login: { text: "Log in", url: "/auth/sign-in" },
          signup: { text: "Get started", url: "/auth/create-account" },
        }}
        portalLink={signedIn ? { text: "Portal", url: "/portal/dashboard" } : undefined}
        actionsSlot={<ThemeToggle />}
      />
    </div>
  );
}
