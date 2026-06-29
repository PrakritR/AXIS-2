"use client";

import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNativeChrome } from "@/hooks/use-is-native-app";
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
    <svg className="h-5 w-5 [html[data-native]_&]:h-[22px] [html[data-native]_&]:w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
};

function MoreNavRow({
  item,
  active,
  showNavIcons,
  onNavigate,
}: {
  item: PortalMoreNavItem;
  active: boolean;
  showNavIcons: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const nativeChrome = useNativeChrome();

  return (
    <Link
      href={item.href}
      prefetch={portalMobileLinkPrefetchEnabled()}
      onClick={(e) => {
        portalNavClick(router, item.href, { preferFullNavigation: nativeChrome })(e);
        onNavigate();
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
      {!item.locked && (item.count ?? 0) > 0 ? <PortalNavCountBadge count={item.count ?? 0} /> : null}
    </Link>
  );
}

export function PortalNativeMoreSheet({
  open,
  onOpenChange,
  items,
  activeSection,
  showNavIcons,
}: PortalNativeMoreSheetProps) {
  const closeSheet = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="portal-native-more-sheet flex max-h-[min(85dvh,720px)] flex-col rounded-t-[1.35rem] border-border px-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-0"
      >
        <div className="shrink-0 px-4 pb-1 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden />
          <SheetTitle className="sr-only">Portal sections</SheetTitle>
        </div>
        <nav
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-1"
          aria-label="Portal sections"
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.section}>
                <MoreNavRow
                  item={item}
                  active={activeSection === item.section}
                  showNavIcons={showNavIcons}
                  onNavigate={closeSheet}
                />
              </li>
            ))}
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
      className={`flex w-full min-w-0 items-center justify-center px-1 pt-0 pb-0 transition ${
        active ? "text-primary" : "text-muted"
      }`}
      aria-label="More portal sections"
    >
      <span className="shrink-0" aria-hidden>
        <MoreGridIcon />
      </span>
    </button>
  );
}
