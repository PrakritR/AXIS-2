"use client";

import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { portalNavClick } from "@/lib/portal-nav-client";
import { portalMobileLinkPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type PortalMoreNavItem = {
  section: string;
  label: string;
  href: string;
  locked?: boolean;
  count?: number;
};

function MoreGridIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="5" r="1.75" />
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="19" cy="5" r="1.75" />
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
      <circle cx="5" cy="19" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
      <circle cx="19" cy="19" r="1.75" />
    </svg>
  );
}

type PortalNativeMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PortalMoreNavItem[];
  activeSection: string;
  showNavIcons: boolean;
  portalTitle: string;
};

export function PortalNativeMoreSheet({
  open,
  onOpenChange,
  items,
  activeSection,
  showNavIcons,
  portalTitle,
}: PortalNativeMoreSheetProps) {
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="portal-native-more-sheet max-h-[min(85dvh,720px)] rounded-t-[1.35rem] border-border px-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-0"
      >
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <SheetTitle className="text-base font-semibold tracking-tight">All sections</SheetTitle>
          <SheetDescription className="text-xs text-muted">
            Full {portalTitle} navigation — same as the website sidebar.
          </SheetDescription>
        </SheetHeader>
        <nav className="overflow-y-auto overscroll-contain px-3 py-3" aria-label="All portal sections">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = activeSection === item.section;
              return (
                <li key={item.section}>
                  <Link
                    href={item.href}
                    prefetch={portalMobileLinkPrefetchEnabled()}
                    onClick={(e) => {
                      portalNavClick(router, item.href)(e);
                      onOpenChange(false);
                    }}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-primary/10 text-primary"
                        : item.locked
                          ? "text-muted/80"
                          : "text-foreground hover:bg-accent/70"
                    }`}
                    aria-label={item.locked ? `${item.label} — locked` : item.label}
                  >
                    {showNavIcons ? (
                      <span className={`shrink-0 ${item.locked ? "opacity-60" : ""}`} aria-hidden>
                        <PortalNavIcon section={item.section} />
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {!item.locked && (item.count ?? 0) > 0 ? (
                      <PortalNavCountBadge count={item.count ?? 0} />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function PortalNativeMoreNavButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 flex-col items-center gap-0 px-0.5 py-0.5 text-[9px] font-semibold leading-tight transition ${
        active ? "text-primary" : "text-muted"
      }`}
      aria-label="More portal sections"
    >
      <span className="shrink-0" aria-hidden>
        <MoreGridIcon />
      </span>
      <span className="max-w-full truncate">More</span>
    </button>
  );
}
