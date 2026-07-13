"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Navbar1, type NavbarMenuItem } from "@/components/ui/navbar1";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { portalDashboardPath, normalizePortalRoles, parseAuthRole, type AuthRole } from "@/lib/auth/portal-roles";
import { RESIDENT_BROWSE_PATH } from "@/lib/resident-public-nav";
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

function portalLinkLabel(role: AuthRole): string {
  if (role === "resident") return "Resident portal";
  if (role === "vendor") return "Vendor portal";
  if (role === "admin") return "Admin";
  return "Portal";
}

export function PublicNavbar() {
  const pathname = usePathname();
  const { isNative } = useIsNativeApp();
  const hideOnNative = isNative === true;
  const [signedIn, setSignedIn] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<AuthRole | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSignedIn(readSignedInFromStorage()));

    const supabase = createSupabaseBrowserClient();

    async function syncAuth(session: Session | null) {
      const isSignedIn = !!session;
      setSignedIn(isSignedIn);
      persistSignedIn(isSignedIn);
      if (!session) {
        setPrimaryRole(null);
        return;
      }

      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle(),
        supabase.from("profile_roles").select("role").eq("user_id", session.user.id),
      ]);
      const roles = normalizePortalRoles(roleRows, profile?.role ?? session.user.user_metadata?.role);
      setPrimaryRole(roles[0] ?? parseAuthRole(String(profile?.role ?? session.user.user_metadata?.role ?? "")));
    }

    void supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      void syncAuth(result.data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      void syncAuth(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const residentActive = useMemo(
    () =>
      pathname === RESIDENT_BROWSE_PATH ||
      pathname.startsWith(`${RESIDENT_BROWSE_PATH}/`) ||
      pathname.startsWith("/rent/listings") ||
      pathname.startsWith("/resident") ||
      pathname.startsWith("/rent/apply"),
    [pathname],
  );
  const contactActive = useMemo(() => pathname === "/contact", [pathname]);
  const pricingActive = useMemo(() => pathname === "/pricing", [pathname]);
  const docsActive = useMemo(() => pathname.startsWith("/docs"), [pathname]);

  const menu: NavbarMenuItem[] = useMemo(
    () => {
      // Slim marketing nav: Browse homes · Pricing · Docs · Contact. Manager/
      // vendor entry points live in the hero CTAs and footer; no "Demo" item —
      // the landing page embeds the demo above the fold. /partner, /vendors,
      // /demo stay routable.
      const items: NavbarMenuItem[] = [
        {
          title: "Browse homes",
          url: RESIDENT_BROWSE_PATH,
          active: residentActive,
          dataAttr: "nav-resident",
        },
        { title: "Pricing", url: "/pricing", active: pricingActive, dataAttr: "nav-pricing" },
        { title: "Docs", url: "/docs", active: docsActive, dataAttr: "nav-docs" },
        { title: "Contact", url: "/contact", active: contactActive, dataAttr: "nav-contact" },
      ];
      return items;
    },
    [residentActive, pricingActive, docsActive, contactActive],
  );

  const portalLink = useMemo(() => {
    if (!signedIn || !primaryRole) return undefined;
    const url = primaryRole === "resident" ? "/resident/applications" : portalDashboardPath(primaryRole);
    return {
      text: portalLinkLabel(primaryRole),
      url,
    };
  }, [signedIn, primaryRole]);

  if (hideOnNative) return null;

  return (
    <div
      id="axis-public-navbar"
      className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top,0px)]"
    >
      <Navbar1
        logoSlot={<AxisLogoLink href="/" size="compact" showWordmark={false} />}
        menu={menu}
        auth={{
          login: { text: "Log in", url: "/auth/sign-in" },
          signup: { text: "Get started", url: "/auth/create-account?mode=create&role=resident" },
        }}
        portalLink={portalLink}
        actionsSlot={<ThemeToggle />}
      />
    </div>
  );
}
