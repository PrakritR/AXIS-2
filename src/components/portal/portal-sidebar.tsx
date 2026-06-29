"use client";

import { AxisAssistantNavButton, useHasAxisAssistant } from "@/components/portal/axis-assistant";
import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import {
  PortalNativeMoreSheet,
  type PortalMoreNavItem,
} from "@/components/portal/portal-native-more-sheet";
import { useCoManagerNavSections } from "@/hooks/use-co-manager-nav-sections";
import { useNativeChrome } from "@/hooks/use-is-native-app";
import { usePortalNavCounts } from "@/hooks/use-portal-nav-counts";
import { usePortalSession } from "@/hooks/use-portal-session";
import { managerSectionLockedForTier, residentSectionLockedForManagerTier } from "@/lib/manager-access";
import { shouldOpenNativeSectionsSheet } from "@/lib/native/open-portal-sections-sheet";
import { orderNativeBottomNavItems } from "@/lib/native/portal-bottom-nav";
import { observeNativeBottomNavInset } from "@/lib/native/sync-portal-bottom-nav-inset";
import { portalNavClick, prefetchPortalHref } from "@/lib/portal-nav-client";
import { portalBackgroundPrefetchEnabled, portalMobileLinkPrefetchEnabled } from "@/lib/portal-nav-prefetch";
import { PORTAL_MOBILE_CHROME_CLASS, PORTAL_NATIVE_BOTTOM_NAV_CLASS } from "@/lib/portal-layout-classes";
import { prefetchPortalPanelChunks } from "@/lib/portal-panel-prefetch";
import type { PortalDefinition } from "@/lib/portal-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";

function hrefForSection(def: PortalDefinition, section: string) {
  const meta = def.sections.find((s) => s.section === section);
  if (!meta) return def.basePath;
  if (!meta.tabs.length) return `${def.basePath}/${section}`;
  return `${def.basePath}/${section}/${meta.tabs[0].id}`;
}

function PortalBrandLogoTile() {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-white/40 bg-[linear-gradient(150deg,rgba(255,255,255,0.45),rgba(255,255,255,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] [html[data-theme=light]_&]:border-border/80 [html[data-theme=light]_&]:bg-[linear-gradient(150deg,rgba(255,255,255,0.95),rgba(233,238,251,0.75))]"
      aria-hidden
    >
      <svg className="h-[22px] w-[38px]" viewBox="0 0 46 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3.5 21.5L11 4L18.5 21.5M7.55 14.25H14.45"
          className="stroke-white [html[data-theme=light]_&]:stroke-foreground"
          strokeWidth="2.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M27 4L43 22" className="stroke-steel-light [html[data-theme=light]_&]:stroke-primary" strokeWidth="2.75" strokeLinecap="round" />
        <path
          d="M43 4L27 22"
          className="stroke-white/80 [html[data-theme=light]_&]:stroke-cobalt-deep"
          strokeWidth="2.55"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function sidebarBrandHref(definition: PortalDefinition): string {
  const dashboard = definition.sections.find((s) => s.section === "dashboard");
  if (dashboard) return `${definition.basePath}/dashboard`;
  return definition.basePath;
}

function SidebarBrandHeader({
  definition,
  brandHref,
}: {
  definition: PortalDefinition;
  brandHref: string;
}) {
  const router = useRouter();
  const isAdmin = definition.kind === "admin";
  const isResident = definition.kind === "resident";
  const brandTitle = definition.title.trim().toLowerCase() === "axis" ? "Axis" : definition.title;

  return (
    <div className="relative overflow-hidden px-5 py-5">
      <div
        className="absolute inset-0 bg-[linear-gradient(135deg,#2a3c5e,#16233f,#0e1830)] [html[data-theme=light]_&]:bg-[linear-gradient(135deg,#e9eefb,#d7e1f3)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_28%_18%,rgba(255,255,255,0.14),transparent_62%)] [html[data-theme=light]_&]:bg-[radial-gradient(ellipse_80%_60%_at_28%_18%,rgba(255,255,255,0.65),transparent_62%)]"
        aria-hidden
      />
      <Link
        href={brandHref}
        prefetch
        aria-label="Axis home"
        className={`relative flex gap-3 transition-opacity hover:opacity-90 ${isAdmin || isResident ? "items-start" : "items-center"}`}
        onClick={portalNavClick(router, brandHref)}
      >
        <PortalBrandLogoTile />
        <div className={`min-w-0 ${isAdmin || isResident ? "pt-0.5" : ""}`}>
          {isAdmin ? (
            <>
              <p className="text-sm font-semibold tracking-[-0.02em] text-white [html[data-theme=light]_&]:text-[var(--cobalt-deep)]">
                Axis · Admin
              </p>
              <span className="mt-1.5 inline-block rounded-full border border-white/25 bg-card/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/85 [html[data-theme=light]_&]:border-primary/25 [html[data-theme=light]_&]:bg-primary/10 [html[data-theme=light]_&]:text-primary">
                ADMIN
              </span>
            </>
          ) : isResident ? (
            <>
              <p className="text-lg font-semibold tracking-[-0.02em] leading-snug text-white [html[data-theme=light]_&]:text-[var(--cobalt-deep)]">
                Axis
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72 [html[data-theme=light]_&]:text-primary/80">
                Resident portal
              </p>
            </>
          ) : (
            <p className="text-lg font-semibold tracking-[-0.02em] leading-none text-white [html[data-theme=light]_&]:text-[var(--cobalt-deep)]">
              {brandTitle}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

function navLinkClass(active: boolean, locked?: boolean) {
  return [
    "relative flex min-h-10 items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 text-[14px] font-medium transition duration-200",
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
}: {
  definition: PortalDefinition;
  subscriptionTier?: "free" | "paid" | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isClient = useIsClient();
  const showNativeChrome = useNativeChrome();
  const brandHref = useMemo(() => sidebarBrandHref(definition), [definition]);
  const hasAssistant = useHasAxisAssistant();
  const session = usePortalSession();
  const visibleSections = useCoManagerNavSections(definition, session.userId);
  const navCounts = usePortalNavCounts(definition.kind);
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

  useEffect(() => {
    if (!portalBackgroundPrefetchEnabled()) return;
    prefetchPortalPanelChunks();
  }, []);

  const activeSection = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const showNavIcons =
    definition.kind === "admin" ||
    definition.kind === "pro" ||
    definition.kind === "resident" ||
    definition.kind === "manager";

  const showManagerTierLocks =
    (definition.kind === "pro" || definition.kind === "manager") && subscriptionTier === "free";
  const showResidentTierLocks = definition.kind === "resident" && subscriptionTier === "free";

  const isSectionLocked = (section: string) => {
    if (showResidentTierLocks) {
      return residentSectionLockedForManagerTier(section, subscriptionTier);
    }
    if (showManagerTierLocks) {
      return managerSectionLockedForTier(section, subscriptionTier);
    }
    return false;
  };

  const nativeBottomNavAllItems = useMemo(
    () => (showNativeChrome ? orderNativeBottomNavItems(navItems, definition.kind) : []),
    [definition.kind, navItems, showNativeChrome],
  );

  const nativeBottomNavItems = useMemo(
    () => nativeBottomNavAllItems.filter((item) => !isSectionLocked(item.section)),
    [nativeBottomNavAllItems, showManagerTierLocks, showResidentTierLocks, subscriptionTier],
  );
  const [sectionsSheetOpen, setSectionsSheetOpen] = useState(false);
  const [bottomNavEl, setBottomNavEl] = useState<HTMLElement | null>(null);
  const bottomNavScrollRef = useRef<HTMLDivElement>(null);
  const topNavScrollRef = useRef<HTMLDivElement>(null);
  const bottomNavTouchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return observeNativeBottomNavInset(bottomNavEl, showNativeChrome);
  }, [bottomNavEl, showNativeChrome]);

  useEffect(() => {
    if (!showNativeChrome) return;
    const strip = bottomNavScrollRef.current;
    if (!strip) return;
    const activeEl = strip.querySelector<HTMLElement>(`[data-native-nav-section="${activeSection}"]`);
    activeEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSection, nativeBottomNavItems, showNativeChrome]);

  useEffect(() => {
    if (showNativeChrome) return;
    const strip = topNavScrollRef.current;
    if (!strip) return;
    const activeEl = strip.querySelector<HTMLElement>(`[data-mobile-nav-section="${activeSection}"]`);
    activeEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSection, navItems, showNativeChrome]);

  const moreSheetItems: PortalMoreNavItem[] = useMemo(
    () =>
      nativeBottomNavAllItems.map((item) => ({
        section: item.section,
        label: item.label,
        href: item.href,
        locked: isSectionLocked(item.section),
        count: navCounts[item.section] ?? 0,
      })),
    [nativeBottomNavAllItems, navCounts, showManagerTierLocks, showResidentTierLocks, subscriptionTier],
  );

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
          prefetch={portalMobileLinkPrefetchEnabled()}
          onClick={
            showNativeChrome
              ? portalNavClick(router, s.href, { preferFullNavigation: true })
              : portalNavClick(router, s.href)
          }
          className={`flex w-[2.75rem] shrink-0 snap-center flex-col items-center justify-end px-1 pt-0 pb-0 transition sm:w-[2.85rem] ${
            active ? "text-primary" : locked ? "text-muted/70" : "text-muted"
          }`}
          aria-label={
            locked
              ? definition.kind === "resident"
                ? `${s.label} — unavailable on your property's Free plan`
                : `${s.label} — locked on Pro or Business`
              : s.label
          }
        >
          {showNavIcons ? (
            <span className={`relative shrink-0 ${locked ? "opacity-60" : "opacity-100"}`} aria-hidden>
              <PortalNavIcon section={s.section} />
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
        aria-label={
          locked
            ? definition.kind === "resident"
              ? `${s.label} — unavailable on your property's Free plan`
              : `${s.label} — locked on Pro or Business`
            : s.label
        }
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

  const desktopAside = (
    <aside className="relative z-40 hidden h-full min-h-0 w-[16.625rem] shrink-0 self-stretch flex-col overflow-hidden border-r border-border bg-background glass-nav lg:flex">
      <SidebarBrandHeader definition={definition} brandHref={brandHref} />
      <nav className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
        <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
          {navItems.map((s) => {
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
                aria-label={
                  locked
                    ? definition.kind === "resident"
                      ? `${s.label} — unavailable on your property's Free plan`
                      : `${s.label} — locked on Pro or Business`
                    : s.label
                }
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {active ? (
                    <span
                      className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_rgba(47,107,255,0.55)]"
                      aria-hidden
                    />
                  ) : null}
                  {showNavIcons ? (
                    <span className={`shrink-0 ${active ? "ml-2 opacity-100" : locked ? "ml-0 opacity-60" : "opacity-80"}`} aria-hidden>
                      <PortalNavIcon section={s.section} />
                    </span>
                  ) : null}
                  <span className={`min-w-0 truncate ${active && !showNavIcons ? "pl-2" : ""}`}>{s.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {!locked ? <PortalNavCountBadge count={count} /> : null}
                  {locked ? <NavLockIcon className="h-3.5 w-3.5 text-muted" /> : null}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );

  return (
    <>
      {desktopAside}

      <div className="shrink-0 lg:hidden">
        <div className={PORTAL_MOBILE_CHROME_CLASS}>
          <nav
            ref={topNavScrollRef}
            className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
            aria-label="Portal sections"
          >
            {navItems.map((s) => renderMobileNavLink(s, "top"))}
          </nav>
        </div>
      </div>

      <PortalNativeMoreSheet
        open={sectionsSheetOpen}
        onOpenChange={setSectionsSheetOpen}
        items={moreSheetItems}
        activeSection={activeSection}
        showNavIcons={showNavIcons}
      />

      {showNativeChrome && nativeBottomNavItems.length > 0 && isClient
        ? createPortal(
            <nav
              ref={setBottomNavEl}
              className={`${PORTAL_NATIVE_BOTTOM_NAV_CLASS} flex flex-col`}
              aria-label="Portal sections"
            >
              <button
                type="button"
                className="portal-native-bottom-nav-pull flex w-full shrink-0 items-center justify-center border-0 bg-transparent px-3 pb-0.5 pt-1"
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
              <div className="flex min-w-0 w-full items-stretch">
                <div
                  ref={bottomNavScrollRef}
                  className="portal-native-bottom-nav-scroll flex min-w-0 w-0 flex-1 flex-nowrap snap-x snap-mandatory gap-0 overflow-x-auto overscroll-x-contain px-1.5 pt-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label="Scroll portal sections"
                >
                  {nativeBottomNavItems.map((s) => renderMobileNavLink(s, "bottom"))}
                </div>
                {hasAssistant ? (
                  <div className="portal-native-bottom-nav-assistant shrink-0 self-stretch border-l border-border">
                    <AxisAssistantNavButton />
                  </div>
                ) : null}
              </div>
            </nav>,
            document.body,
          )
        : null}
    </>
  );
}
