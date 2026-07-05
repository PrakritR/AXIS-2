"use client";

import { User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolvePortalMobileBackTarget } from "@/lib/portal-mobile-back";
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
 * Resident mobile/native top row: a "‹ Dashboard" back button (when not on
 * the Dashboard hub itself) plus a top-right profile menu (Settings, Sign
 * out) — the resident's only path to those since there's no bottom tab bar.
 */
export function ResidentMobileNavBar({
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
  const back = useMemo(() => resolvePortalMobileBackTarget(pathname, definition), [pathname, definition]);
  const displayName = (name ?? "").trim() || (email ?? "").trim() || "Account";

  return (
    <div className="mb-3 flex items-center gap-2 lg:hidden">
      {back ? (
        <button
          type="button"
          data-attr="portal-mobile-back"
          onClick={() => router.push(back.href)}
          className="-ml-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/25 active:bg-primary/15"
        >
          <ChevronLeftIcon />
          <span className="truncate">{back.label}</span>
        </button>
      ) : null}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            data-attr="resident-mobile-profile-menu"
            aria-label="Account menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-[var(--cobalt-deep,#16233f)] text-[12px] font-bold text-white outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {initials(name, email)}
          </DropdownMenuTrigger>

          <DropdownMenuContent backdrop align="end">
            <div className="border-b border-border px-3 pb-2.5 pt-1.5">
              <p className="truncate text-[13.5px] font-semibold text-foreground">{displayName}</p>
              {email ? <p className="truncate text-[12px] text-muted">{email}</p> : null}
            </div>

            <DropdownMenuItem asChild>
              <Link href={`${definition.basePath}/profile`} data-attr="resident-mobile-profile-settings">
                <User aria-hidden />
                Settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <PortalSignOutButton
              dataAttr="resident-mobile-profile-sign-out"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-red-600 transition hover:bg-accent/70 disabled:opacity-60"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
