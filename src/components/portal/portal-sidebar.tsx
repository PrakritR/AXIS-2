"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import { PortalSignOutButton } from "@/components/portal/portal-sign-out-button";
import { useCoManagerNavSections } from "@/hooks/use-co-manager-nav-sections";
import { usePortalNavCounts } from "@/hooks/use-portal-nav-counts";
import { usePortalSession } from "@/hooks/use-portal-session";
import { managerSectionLockedForTier, residentSectionLockedForManagerTier } from "@/lib/manager-access";
import type { PortalDefinition } from "@/lib/portal-types";

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

function SidebarBrandHeader({ definition }: { definition: PortalDefinition }) {
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
        href="/"
        aria-label="Axis home"
        className={`relative flex gap-3 transition-opacity hover:opacity-90 ${isAdmin || isResident ? "items-start" : "items-center"}`}
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
  const session = usePortalSession();
  const visibleSections = useCoManagerNavSections(definition, session.userId);
  const navCounts = usePortalNavCounts(definition.kind);
  const [accountOpen, setAccountOpen] = useState(false);
  const navItems = useMemo(
    () =>
      visibleSections.map((section) => ({
        section: section.section,
        label: section.label,
        href: hrefForSection(definition, section.section),
      })),
    [definition, visibleSections],
  );

  const activeSection = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const hasSignOut =
    definition.kind === "resident" ||
    definition.kind === "manager" ||
    definition.kind === "admin" ||
    definition.kind === "pro";

  const showNavIcons =
    definition.kind === "admin" ||
    definition.kind === "pro" ||
    definition.kind === "resident" ||
    definition.kind === "manager";

  const leavePaymentsSection = (event: MouseEvent<HTMLAnchorElement>, targetSection: string, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (activeSection !== "payments" || targetSection === "payments") return;
    event.preventDefault();
    window.location.assign(href);
  };

  useEffect(() => {
    if (!accountOpen || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [accountOpen]);

  const mobileBrandTitle =
    definition.kind === "admin"
      ? "Axis · Admin"
      : definition.kind === "resident"
        ? "Resident portal"
        : definition.title.trim().toLowerCase() === "axis"
          ? "Axis"
          : definition.title;

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

  const desktopAside = (
    <aside className="relative z-40 hidden h-full min-h-0 w-[16.625rem] shrink-0 self-stretch flex-col overflow-hidden border-r border-border bg-background glass-nav lg:flex">
      <SidebarBrandHeader definition={definition} />
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
                prefetch
                onClick={(event) => leavePaymentsSection(event, s.section, s.href)}
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
        {hasSignOut ? (
          <div className="mt-auto space-y-0.5 border-t border-border pt-3">
            <PortalRoleSwitcher currentKind={definition.kind} />
            <div className="flex items-center gap-2">
              <PortalSignOutButton className="min-w-0 flex-1 rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-accent/70 hover:text-foreground disabled:opacity-60" />
              <ThemeToggle className="shrink-0" />
            </div>
          </div>
        ) : null}
      </nav>
    </aside>
  );

  return (
    <>
      {desktopAside}

      <div className="shrink-0 lg:hidden">
        <div className="border-b border-border bg-background lg:hidden">
          <div className="flex items-center gap-2.5 px-3 pt-2 sm:px-4">
            <div className="h-11 w-1 shrink-0 rounded-full bg-primary shadow-[0_0_10px_rgba(47,107,255,0.45)]" aria-hidden />
            <div className="min-w-0 flex-1 py-1">
              {mobileBrandTitle === "Axis" ? (
                <p className="truncate text-sm font-semibold leading-snug text-foreground">Axis</p>
              ) : (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Axis</p>
                  <p className="truncate text-sm font-semibold leading-snug text-foreground">{mobileBrandTitle}</p>
                </>
              )}
            </div>
            {hasSignOut ? (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-[var(--shadow-sm)]"
                onClick={() => setAccountOpen(true)}
              >
                Account
              </button>
            ) : null}
          </div>
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto px-3 pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
            {navItems.map((s) => {
              const active = activeSection === s.section;
              const locked = isSectionLocked(s.section);
              const count = navCounts[s.section] ?? 0;
              return (
                <Link
                  key={s.section}
                  href={s.href}
                  prefetch
                  onClick={(event) => leavePaymentsSection(event, s.section, s.href)}
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
            })}
          </div>
        </div>

        {accountOpen && hasSignOut ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] bg-foreground/45 backdrop-blur-[1px] lg:hidden"
              aria-label="Close account menu"
              onClick={() => setAccountOpen(false)}
            />
            <div className="fixed right-0 bottom-0 left-0 z-[100] max-h-[min(70vh,28rem)] overflow-y-auto rounded-t-[1.35rem] border border-border bg-background px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-24px_48px_-20px_rgba(15,23,42,0.28)] lg:hidden">
              <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Account</p>
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                <PortalRoleSwitcher currentKind={definition.kind} />
                <div className="flex items-center gap-2">
                  <PortalSignOutButton
                    className="min-w-0 flex-1 rounded-[14px] px-3 py-3 text-center text-sm font-semibold text-foreground ring-1 ring-border transition hover:bg-accent/70 disabled:opacity-60"
                    onSignedOut={() => setAccountOpen(false)}
                  />
                  <ThemeToggle className="shrink-0" />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
