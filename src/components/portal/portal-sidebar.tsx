"use client";

import { AxisLogoMark } from "@/components/brand/axis-logo";
import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import {
  PortalNativeMoreNavButton,
  PortalNativeMoreSheet,
  type PortalMoreNavItem,
} from "@/components/portal/portal-native-more-sheet";
import { useCoManagerNavSections } from "@/hooks/use-co-manager-nav-sections";
import { useIsSmallPortalViewport, useNativeChrome } from "@/hooks/use-is-native-app";
import { usePortalNavCounts } from "@/hooks/use-portal-nav-counts";
import { usePortalSession } from "@/hooks/use-portal-session";
import { managerSectionLockedForTier, residentSectionLockedForManagerTier } from "@/lib/manager-access";
import { shouldOpenNativeSectionsSheet } from "@/lib/native/open-portal-sections-sheet";
import {
  nativeBottomBarEnabledForKind,
  nativeBottomNavShowMoreTab,
  orderNativeBottomNavItems,
  splitNativeBottomNavItems,
} from "@/lib/native/portal-bottom-nav";
import { adjacentPrimarySection, resolveSwipePageDirection } from "@/lib/native/portal-swipe-page";
import { playSwipeEnter, playSwipeExit, resetSwipeTransform } from "@/lib/native/portal-swipe-page-transition";
import { observeNativeBottomNavInset } from "@/lib/native/sync-portal-bottom-nav-inset";
import {
  isCrossPortalNavigation,
  portalNavClick,
  prefetchPortalHref,
  usePortalNavigate,
} from "@/lib/portal-nav-client";
import { portalBackgroundPrefetchEnabled, portalMobileLinkPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import {
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MOBILE_CHROME_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_CLASS,
} from "@/lib/portal-layout-classes";
import { prefetchPortalPanelChunks } from "@/lib/portal-panel-prefetch";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/portal-sidebar-cookie";
import { groupNavItems, isHiddenFromMobileNav } from "@/lib/portals/nav-groups";
import type { PortalDefinition, PortalKind } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";

function hrefForSection(def: PortalDefinition, section: string) {
  const meta = def.sections.find((s) => s.section === section);
  if (!meta) return def.basePath;
  if (!meta.tabs.length) return `${def.basePath}/${section}`;
  return `${def.basePath}/${section}/${meta.tabs[0].id}`;
}

function portalBrandCopy(kind: PortalKind): { subtitle: string; ariaLabel: string } {
  switch (kind) {
    case "resident":
      return { subtitle: "Resident", ariaLabel: "Axis Resident Portal home" };
    case "admin":
      return { subtitle: "Admin", ariaLabel: "Axis Admin Portal home" };
    case "vendor":
      return { subtitle: "Vendor", ariaLabel: "Axis Vendor Portal home" };
    default:
      return { subtitle: "Manager", ariaLabel: "Axis Manager Portal home" };
  }
}

function navLinkClass(active: boolean, locked?: boolean) {
  return [
    "relative flex min-h-9 items-center justify-between gap-2 rounded-[12px] px-2.5 py-[7px] text-[13px] font-medium transition duration-200",
    active
      ? "bg-[var(--glass-fill)] text-foreground shadow-[inset_0_0_0_1px_var(--glass-border)] ring-1 ring-border/60 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
      : locked
        ? "text-muted/80 hover:bg-accent/50 hover:text-muted [html[data-theme=dark]_&]:text-white/55"
        : "text-muted hover:bg-accent/70 hover:text-foreground [html[data-theme=dark]_&]:text-white/78",
  ].join(" ");
}

function NavLockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function PortalSidebar({
  definition,
  subscriptionTier,
  subtitle,
  initialCollapsed = false,
}: {
  definition: PortalDefinition;
  subscriptionTier?: "free" | "paid" | null;
  /** Header badge under "Axis": manager plan (Free/Pro/Business) or portal role. */
  subtitle?: string;
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isClient = useIsClient();
  const showNativeChrome = useNativeChrome();
  const isSmallViewport = useIsSmallPortalViewport();
  // Native app OR a phone-width browser — same bottom-nav chrome in both; only
  // the desktop (`lg:`) sidebar differs. Cross-portal full-navigation stays
  // native-only below (a WebView-specific routing quirk, not a viewport one).
  const showMobileNav = showNativeChrome || isSmallViewport;
  const navigate = usePortalNavigate();
  const session = usePortalSession();
  const visibleSections = useCoManagerNavSections(definition, session.userId);
  const navCounts = usePortalNavCounts(definition.kind);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const navItems = useMemo(
    () =>
      visibleSections.map((section) => ({
        section: section.section,
        label: section.label,
        href: hrefForSection(definition, section.section),
        prefetchHrefs: section.tabs.length
          ? section.tabs.map((tab) => `${definition.basePath}/${section.section}/${tab.id}`)
          : [`${definition.basePath}/${section.section}`],
      })),
    [definition, visibleSections],
  );

  const navGroups = useMemo(() => groupNavItems(definition.kind, navItems), [definition.kind, navItems]);
  const firstTrailingGroupIdx = useMemo(
    () => navGroups.findIndex((g) => g.id === "account" || g.id === "more"),
    [navGroups],
  );

  useEffect(() => {
    if (!portalBackgroundPrefetchEnabled()) return;
    prefetchPortalPanelChunks();
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  const activeSection = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const showNavIcons =
    definition.kind === "admin" ||
    definition.kind === "pro" ||
    definition.kind === "resident" ||
    definition.kind === "manager" ||
    definition.kind === "vendor";

  const showManagerTierLocks =
    (definition.kind === "pro" || definition.kind === "manager") && subscriptionTier === "free";
  const showResidentTierLocks = definition.kind === "resident" && subscriptionTier === "free";

  const isSectionLocked = useCallback(
    (section: string) => {
      if (showResidentTierLocks) {
        return residentSectionLockedForManagerTier(section, subscriptionTier);
      }
      if (showManagerTierLocks) {
        return managerSectionLockedForTier(section, subscriptionTier);
      }
      return false;
    },
    [showResidentTierLocks, showManagerTierLocks, subscriptionTier],
  );

  const nativeBottomNavSplit = useMemo(
    () =>
      showMobileNav && nativeBottomBarEnabledForKind(definition.kind)
        ? splitNativeBottomNavItems(navItems, definition.kind)
        : { primary: [], overflow: [] },
    [definition.kind, navItems, showMobileNav],
  );

  const nativeBottomNavItems = useMemo(
    () => nativeBottomNavSplit.primary.filter((item) => !isSectionLocked(item.section)),
    [nativeBottomNavSplit, isSectionLocked],
  );
  const showMoreTab = showMobileNav && nativeBottomNavShowMoreTab(definition.kind, navItems);
  const moreTabActive = !nativeBottomNavItems.some((item) => item.section === activeSection);
  const [sectionsSheetOpen, setSectionsSheetOpen] = useState(false);
  const [bottomNavEl, setBottomNavEl] = useState<HTMLElement | null>(null);
  const bottomNavScrollRef = useRef<HTMLDivElement>(null);
  const topNavScrollRef = useRef<HTMLDivElement>(null);
  const bottomNavTouchRef = useRef<{ x: number; y: number } | null>(null);

  // Latest values for the swipe-page gesture handlers below, which are attached
  // imperatively (outside React's render cycle) and must always read current data.
  const swipeOrderRef = useRef<{ section: string; href: string }[]>([]);
  const activeSectionRef = useRef(activeSection);
  const contentTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pendingSwipeEnterRef = useRef<"left" | "right" | null>(null);

  useEffect(() => {
    swipeOrderRef.current = nativeBottomNavItems;
  }, [nativeBottomNavItems]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    return observeNativeBottomNavInset(bottomNavEl, showMobileNav);
  }, [bottomNavEl, showMobileNav]);

  // Apple-style paged swipe between the fixed bar's main tabs — a horizontal
  // touch gesture on the page content pages to the adjacent primary tab, kept in
  // sync with the bar since navigation drives `activeSection` the same as a tap.
  useEffect(() => {
    if (!showMobileNav) return;
    const contentEl = document.getElementById(PORTAL_MAIN_CONTENT_ID);
    if (!contentEl) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      contentTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = contentTouchStartRef.current;
      contentTouchStartRef.current = null;
      const touch = e.changedTouches[0];
      if (!start || !touch) return;

      const direction = resolveSwipePageDirection({
        startX: start.x,
        startY: start.y,
        endX: touch.clientX,
        endY: touch.clientY,
      });
      if (!direction) return;

      const order = swipeOrderRef.current.map((item) => item.section);
      const adjacent = adjacentPrimarySection(order, activeSectionRef.current, direction);
      if (!adjacent) return;
      const href = swipeOrderRef.current.find((item) => item.section === adjacent)?.href;
      if (!href) return;

      pendingSwipeEnterRef.current = direction;
      void playSwipeExit(contentEl, direction).then(() => navigate(href));
    };

    contentEl.addEventListener("touchstart", onTouchStart, { passive: true });
    contentEl.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      contentEl.removeEventListener("touchstart", onTouchStart);
      contentEl.removeEventListener("touchend", onTouchEnd);
      resetSwipeTransform(contentEl);
    };
  }, [showMobileNav, navigate]);

  // Once the swiped-to tab's content has actually mounted (pathname settled),
  // play the entrance half of the slide from the opposite edge.
  useEffect(() => {
    const direction = pendingSwipeEnterRef.current;
    if (!direction) return;
    pendingSwipeEnterRef.current = null;
    const contentEl = document.getElementById(PORTAL_MAIN_CONTENT_ID);
    if (!contentEl) return;
    playSwipeEnter(contentEl, direction);
  }, [pathname]);

  useEffect(() => {
    if (!showMobileNav) return;
    const strip = bottomNavScrollRef.current;
    if (!strip) return;
    const activeEl = strip.querySelector<HTMLElement>(`[data-native-nav-section="${activeSection}"]`);
    activeEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSection, nativeBottomNavItems, showMobileNav]);

  useEffect(() => {
    if (showNativeChrome) return;
    const strip = topNavScrollRef.current;
    if (!strip) return;
    const activeEl = strip.querySelector<HTMLElement>(`[data-mobile-nav-section="${activeSection}"]`);
    activeEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSection, navItems, showNativeChrome]);

  // The swipe-up "More" sheet is the full section index — every section, not just
  // the ones outside the fixed bar. Primary-bar sections (e.g. Documents) are
  // deliberately listed here too so there's always one comprehensive place to
  // find anything, alongside their one-tap bar shortcut.
  const moreSheetItems: PortalMoreNavItem[] = useMemo(() => {
    const ordered = orderNativeBottomNavItems(navItems, definition.kind);
    return ordered
      .filter((item) => !isHiddenFromMobileNav(definition.kind, item.section))
      .map((item) => ({
        section: item.section,
        label: item.label,
        href: item.href,
        locked: isSectionLocked(item.section),
        count: navCounts[item.section] ?? 0,
      }));
  }, [navItems, definition.kind, navCounts, isSectionLocked]);

  const mobileTopStripItems = useMemo(
    () =>
      orderNativeBottomNavItems(
        navItems.filter((s) => !isHiddenFromMobileNav(definition.kind, s.section)),
        definition.kind,
      ),
    [navItems, definition.kind],
  );

  const lockAriaLabel = (label: string, locked: boolean) =>
    locked
      ? definition.kind === "resident"
        ? `${label} — unavailable on your property's Free plan`
        : `${label} — locked on Pro or Business`
      : label;

  const renderMobileNavLink = (
    s: (typeof navItems)[number],
    variant: "top" | "bottom",
  ) => {
    const active = activeSection === s.section;
    const locked = isSectionLocked(s.section);
    const count = navCounts[s.section] ?? 0;

    if (variant === "bottom") {
      return (
        <Link
          key={s.section}
          href={s.href}
          data-native-nav-section={s.section}
          data-attr={`bottom-nav-${s.section}`}
          prefetch={portalMobileLinkPrefetchEnabled()}
          onClick={portalNavClick(router, s.href, {
            preferFullNavigation: showNativeChrome && isCrossPortalNavigation(pathname, s.href),
          })}
          className={`flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 py-2 transition ${
            active ? "text-primary" : "text-foreground"
          }`}
          aria-label={lockAriaLabel(s.label, locked)}
          aria-current={active ? "page" : undefined}
        >
          {showNavIcons ? (
            <span
              className={`relative shrink-0 transition-opacity duration-200 ${
                active ? "opacity-100" : locked ? "opacity-45" : "opacity-60"
              }`}
              aria-hidden
            >
              <PortalNavIcon
                section={s.section}
                className="h-[23px] w-[23px] shrink-0"
                strokeWidth={active ? 2.35 : 1.75}
              />
              {!locked && count > 0 ? (
                <span className="absolute -top-1 -right-1.5">
                  <PortalNavCountBadge count={count} />
                </span>
              ) : null}
            </span>
          ) : null}
        </Link>
      );
    }

    return (
      <Link
        key={s.section}
        href={s.href}
        data-mobile-nav-section={s.section}
        prefetch={portalMobileLinkPrefetchEnabled()}
        onClick={portalNavClick(router, s.href)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition sm:text-[13px] ${
          active
            ? "bg-[var(--glass-fill)] text-foreground shadow-[inset_0_0_0_1px_var(--glass-border)] ring-1 ring-primary/20 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
            : locked
              ? "bg-accent/35 text-muted ring-1 ring-transparent [html[data-theme=dark]_&]:text-white/55"
              : "bg-accent/50 text-muted ring-1 ring-transparent hover:bg-accent hover:text-foreground [html[data-theme=dark]_&]:text-white/78"
        }`}
        aria-label={lockAriaLabel(s.label, locked)}
      >
        {showNavIcons ? (
          <span className={`shrink-0 ${locked ? "opacity-60" : "opacity-90"}`} aria-hidden>
            <PortalNavIcon section={s.section} />
          </span>
        ) : null}
        {s.label}
        {!locked ? <PortalNavCountBadge count={count} /> : null}
        {locked ? <NavLockIcon className="h-3 w-3 text-muted" /> : null}
      </Link>
    );
  };

  const renderDesktopLink = (s: (typeof navItems)[number]) => {
    const active = activeSection === s.section;
    const locked = isSectionLocked(s.section);
    const count = navCounts[s.section] ?? 0;
    return (
      <Link
        key={s.section}
        href={s.href}
        prefetch={portalBackgroundPrefetchEnabled()}
        onMouseEnter={
          portalBackgroundPrefetchEnabled()
            ? () => {
                prefetchPortalHref(router, s.href);
                for (const href of s.prefetchHrefs) prefetchPortalHref(router, href);
              }
            : undefined
        }
        className={navLinkClass(active, locked)}
        aria-label={lockAriaLabel(s.label, locked)}
        aria-current={active ? "page" : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {showNavIcons ? (
            <span className={active ? "text-primary" : locked ? "opacity-60" : "opacity-80"} aria-hidden>
              <PortalNavIcon section={s.section} className="h-[17px] w-[17px] shrink-0" />
            </span>
          ) : null}
          <span className="min-w-0 truncate">{s.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {!locked ? <PortalNavCountBadge count={count} /> : null}
          {locked ? <NavLockIcon className="h-3.5 w-3.5 text-muted" /> : null}
        </span>
      </Link>
    );
  };

  const renderRailLink = (s: (typeof navItems)[number]) => {
    const active = activeSection === s.section;
    const locked = isSectionLocked(s.section);
    const count = navCounts[s.section] ?? 0;
    return (
      <Link
        key={s.section}
        href={s.href}
        prefetch={portalBackgroundPrefetchEnabled()}
        onMouseEnter={
          portalBackgroundPrefetchEnabled()
            ? () => {
                prefetchPortalHref(router, s.href);
                for (const href of s.prefetchHrefs) prefetchPortalHref(router, href);
              }
            : undefined
        }
        title={s.label}
        aria-label={lockAriaLabel(s.label, locked)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-[12px] transition",
          active
            ? "bg-[var(--glass-fill)] text-primary ring-1 ring-border/60 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
            : locked
              ? "text-muted/60 hover:bg-accent/50"
              : "text-muted hover:bg-accent/70 hover:text-foreground",
        )}
      >
        <PortalNavIcon section={s.section} className="h-[17px] w-[17px] shrink-0" />
        {!locked && count > 0 ? (
          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        ) : null}
        {locked ? <NavLockIcon className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-muted" /> : null}
      </Link>
    );
  };

  const brand = portalBrandCopy(definition.kind);
  const rawSubtitle = subtitle?.trim() || brand.subtitle;
  // Property portal: show the portal name instead of the billing tier.
  const headerSubtitle = rawSubtitle === "Pro" || rawSubtitle === "Business" ? "Property" : rawSubtitle;

  const desktopAside = (
    <aside
      className={cn(
        "relative z-40 hidden h-full min-h-0 shrink-0 self-stretch flex-col overflow-hidden border-r border-border bg-background glass-nav lg:flex",
        collapsed ? "w-[58px]" : "w-[224px]",
      )}
    >
      {collapsed ? (
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-border">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            aria-expanded={false}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-accent/70 hover:text-foreground"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
          <Link
            href="/"
            prefetch
            aria-label="Axis home"
            className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <AxisLogoMark size="compact" />
            <span className="min-w-0 leading-tight">
              <span className="block text-[14px] font-semibold text-foreground">Axis</span>
              <span className="mt-0.5 inline-block rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                {headerSubtitle}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            aria-expanded
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-accent/70 hover:text-foreground"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {collapsed ? (
        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2.5" aria-label="Portal sections">
          {navGroups.map((group, i) => (
            <div
              key={group.id}
              className={cn("flex w-full flex-col items-center gap-1", i === firstTrailingGroupIdx && "mt-auto")}
            >
              {i > 0 ? <div className="my-1 h-px w-6 bg-border" aria-hidden /> : null}
              {group.items.map((s) => renderRailLink(s))}
            </div>
          ))}
        </nav>
      ) : (
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" aria-label="Portal sections">
          {navGroups.map((group, i) => (
            <div
              key={group.id}
              className={cn("flex flex-col gap-0.5", i === firstTrailingGroupIdx && "mt-auto pt-2")}
            >
              {group.label ? (
                <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted/70">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((s) => renderDesktopLink(s))}
            </div>
          ))}
        </nav>
      )}
    </aside>
  );

  return (
    <>
      {desktopAside}

      <div className="shrink-0 lg:hidden">
        <div className={PORTAL_MOBILE_CHROME_CLASS}>
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <Link
              href="/"
              prefetch
              aria-label="Axis home"
              className="shrink-0 transition-opacity hover:opacity-90"
            >
              <AxisLogoMark size="compact" />
            </Link>
            <nav
              ref={topNavScrollRef}
              className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Portal sections"
            >
              {mobileTopStripItems.map((s) => renderMobileNavLink(s, "top"))}
            </nav>
          </div>
        </div>
      </div>

      <PortalNativeMoreSheet
        open={sectionsSheetOpen}
        onOpenChange={setSectionsSheetOpen}
        items={moreSheetItems}
        kind={definition.kind}
        activeSection={activeSection}
        showNavIcons={showNavIcons}
      />

      {showMobileNav && nativeBottomNavItems.length > 0 && isClient
        ? createPortal(
            <nav
              ref={setBottomNavEl}
              className={`${PORTAL_NATIVE_BOTTOM_NAV_CLASS} flex flex-col`}
              aria-label="Portal sections"
            >
              <button
                type="button"
                className="portal-native-bottom-nav-pull flex w-full shrink-0 items-center justify-center border-0 bg-transparent px-3 pb-0 pt-1"
                aria-label="Show all sections"
                onClick={() => setSectionsSheetOpen(true)}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  if (!touch) return;
                  bottomNavTouchRef.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchEnd={(e) => {
                  const start = bottomNavTouchRef.current;
                  bottomNavTouchRef.current = null;
                  const touch = e.changedTouches[0];
                  if (!start || !touch) return;
                  if (
                    shouldOpenNativeSectionsSheet({
                      startX: start.x,
                      startY: start.y,
                      endX: touch.clientX,
                      endY: touch.clientY,
                    })
                  ) {
                    setSectionsSheetOpen(true);
                  }
                }}
              >
                <span className="portal-native-bottom-nav-pull-handle" aria-hidden />
              </button>
              <div
                ref={bottomNavScrollRef}
                className="portal-native-bottom-nav-scroll flex min-w-0 w-full flex-nowrap items-stretch justify-evenly gap-0 px-1"
                aria-label="Scroll portal sections"
              >
                {nativeBottomNavItems.map((s) => renderMobileNavLink(s, "bottom"))}
                {showMoreTab ? (
                  <PortalNativeMoreNavButton active={moreTabActive} onClick={() => setSectionsSheetOpen(true)} />
                ) : null}
              </div>
            </nav>,
            document.body,
          )
        : null}
    </>
  );
}
