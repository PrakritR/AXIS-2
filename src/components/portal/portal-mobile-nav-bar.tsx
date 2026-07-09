"use client";

import { User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  portalDashboardMobileHeaderLabel,
  resolvePortalMobileBackTarget,
} from "@/lib/portal-mobile-back";
import type { PortalDefinition } from "@/lib/portal-types";

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function initials(name: string | null, email: string | null): string {
  const src = (name ?? "").trim() || (email ?? "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Shared mobile/native top row for every portal: a "‹ <label>" back button
 * (resolvePortalMobileBackTarget; null on Dashboard, where a plain "Dashboard"
 * label shows instead) plus a top-right profile menu (Settings, Sign out).
 * Manager/resident/vendor native bottom bars no longer carry Dashboard or
 * Settings tabs directly, so this is their only path to both.
 */
export function PortalMobileNavBar({
  definition,
  name,
  email,
}: {
  definition: PortalDefinition;
  name: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = useMemo(
    () => resolvePortalMobileBackTarget(pathname, definition, searchParams),
    [pathname, definition, searchParams],
  );
  const dashboardLabel = useMemo(
    () => portalDashboardMobileHeaderLabel(pathname, definition),
    [pathname, definition],
  );
  const displayName = (name ?? "").trim() || (email ?? "").trim() || "Account";

  return (
    <div className="portal-mobile-nav-bar relative mb-3 flex w-full items-center justify-between gap-2 md:hidden [html[data-native]_&]:mb-0">
      {/* Brand mark, centered in the bar for every portal; links home. */}
      <Link
        href={`${definition.basePath}/dashboard`}
        aria-label="Dashboard"
        data-attr="portal-mobile-brand-mark"
        className="absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/30 active:opacity-80"
      >
        <AxisLogoMark size="compact" />
      </Link>
      {back ? (
        <button
          type="button"
          data-attr="portal-mobile-back"
          onClick={() => router.push(back.href)}
          className="-ml-2 inline-flex min-h-11 max-w-[38%] items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 active:bg-primary/15 [html[data-native]_&]:min-h-9 [html[data-native]_&]:py-1"
        >
          <ChevronLeftIcon />
          <span className="truncate">{back.label}</span>
        </button>
      ) : dashboardLabel ? (
        <h1 className="min-w-0 max-w-[38%] truncate px-2 text-sm font-semibold text-foreground [html[data-native]_&]:py-1">
          {dashboardLabel}
        </h1>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            data-attr="portal-mobile-profile-menu"
            aria-label="Account menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-[var(--cobalt-deep,#16233f)] text-[12px] font-bold text-white outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 [html[data-native]_&]:h-9 [html[data-native]_&]:w-9"
          >
            {initials(name, email)}
          </DropdownMenuTrigger>

          <DropdownMenuContent backdrop align="end">
            <div className="border-b border-border px-3 pb-2.5 pt-1.5">
              <p className="truncate text-[13.5px] font-semibold text-foreground">{displayName}</p>
              {email ? <p className="truncate text-[12px] text-muted">{email}</p> : null}
            </div>

            <DropdownMenuItem asChild>
              <Link href={`${definition.basePath}/profile`} data-attr="portal-mobile-profile-settings">
                <User aria-hidden />
                Settings
              </Link>
            </DropdownMenuItem>

            <div className="px-1">
              <PortalRoleSwitcher currentKind={definition.kind} />
            </div>

            <DropdownMenuSeparator />

            <PortalSignOutButton
              dataAttr="portal-mobile-profile-sign-out"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-red-600 transition hover:bg-accent/70 disabled:opacity-60"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
