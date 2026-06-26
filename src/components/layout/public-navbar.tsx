"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Navbar1, type NavbarMenuItem } from "@/components/ui/navbar1";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

export function PublicNavbar() {
  const pathname = usePathname();

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
        actionsSlot={<ThemeToggle />}
      />
    </div>
  );
}
