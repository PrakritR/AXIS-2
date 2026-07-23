"use client";

import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNativeChrome } from "@/hooks/use-is-native-app";
import { isCrossPortalNavigation, portalNavClick } from "@/lib/portal-nav-client";
import { portalMobileLinkPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import { groupNavItems } from "@/lib/portals/nav-groups";
import type { PortalKind } from "@/lib/portal-types";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

export type PortalMoreNavItem = {
  section: string;
  label: string;
  href: string;
  locked?: boolean;
  count?: number;
};

function MoreGridIcon() {
  return (
    <svg className="h-[23px] w-[23px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
  /** Portal role — buckets the sheet into the same grouped sections as the web sidebar. */
  kind: PortalKind;
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
  const pathname = usePathname();
  const nativeChrome = useNativeChrome();

  return (
    <Link
      href={item.href}
      prefetch={portalMobileLinkPrefetchEnabled()}
      onClick={(e) => {
        portalNavClick(router, item.href, {
          preferFullNavigation: nativeChrome && isCrossPortalNavigation(pathname, item.href),
        })(e);
        onNavigate();
      }}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-primary/10 text-primary"
          : item.locked
            ? "text-muted/80"
            : "text-foreground hover:bg-accent/70"
      }`}
      aria-label={item.locked ? `${item.label} (locked)` : item.label}
    >
      {showNavIcons ? (
        <span className={`shrink-0 ${item.locked ? "opacity-60" : ""}`} aria-hidden>
          <PortalNavIcon section={item.section} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!item.locked && (item.count ?? 0) > 0 ? <PortalNavCountBadge count={item.count ?? 0} /> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted/60" aria-hidden />
    </Link>
  );
}

export function PortalNativeMoreSheet({
  open,
  onOpenChange,
  items,
  kind,
  activeSection,
  showNavIcons,
}: PortalNativeMoreSheetProps) {
  const closeSheet = () => onOpenChange(false);

  // Bucket into the same headings/order as the web sidebar (PORTAL_NAV_GROUPS).
  // The web sidebar excludes some sections (e.g. `profile`) because they live in
  // the desktop-only account menu; on mobile this sheet is the only surface for
  // them, so append anything grouping dropped as a trailing group.
  const navGroups = useMemo(() => {
    const grouped = groupNavItems(kind, items);
    const rendered = new Set(grouped.flatMap((g) => g.items.map((i) => i.section)));
    const trailing = items.filter((i) => !rendered.has(i.section));
    if (trailing.length) grouped.push({ id: "account-extra", label: null, items: trailing });
    return grouped;
  }, [kind, items]);

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
          {navGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1 pt-1 first:pt-0">
              {group.label ? (
                <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted/70">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-1">
                {group.items.map((item) => (
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
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Trailing tab in the fixed native bottom bar — opens the full section sheet. */
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
      data-attr="bottom-nav-more"
      onClick={onClick}
      className={`flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 py-2 transition ${
        active ? "text-primary" : "text-foreground"
      }`}
      aria-label="More portal sections"
    >
      <span
        className={`shrink-0 transition-opacity duration-200 ${active ? "opacity-100" : "opacity-60"}`}
        aria-hidden
      >
        <MoreGridIcon />
      </span>
    </button>
  );
}
