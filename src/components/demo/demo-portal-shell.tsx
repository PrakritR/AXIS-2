"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalNavCountBadge } from "@/components/portal/portal-nav-count-badge";
import { usePortalNavCounts } from "@/hooks/use-portal-nav-counts";
import { PortalContainerProvider } from "@/components/ui/portal-container-context";
import { groupNavItems } from "@/lib/portals/nav-groups";
import { proPortal } from "@/lib/portals/pro";
import { RESIDENT_APPROVED_PORTAL_SECTIONS, RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import type { PortalDefinition, PortalSection } from "@/lib/portal-types";
import { closeAxisAssistant, sendAxisAssistantPrompt } from "@/lib/axis-assistant/open-store";
import {
  DEMO_NAVIGATE_EVENT,
  getDemoRole,
  setDemoRole,
  subscribeDemoRole,
  type DemoPortalRole,
} from "@/lib/demo/demo-session";
import { DemoSectionRenderer } from "@/components/demo/demo-section-renderer";
import { DemoFrameAssistant } from "@/components/demo/demo-frame-assistant";
import { DemoShowcaseOverlay, type ShowcaseKind } from "@/components/demo/demo-showcase-overlay";

/** App routes a reused portal panel might try to navigate to. In the demo these
 * must never reach the real (auth-gated) router — either they map to an in-demo
 * section switch or they are swallowed so the visitor stays in the sandbox. */
const DEMO_INTERCEPT_HREF = /^\/(portal|resident|admin|auth|rent)(\/|$)/;

/** Parse an in-app portal href (`/resident/documents/receipts`) into the demo's
 * section + tab. Returns null for routes with no in-demo equivalent
 * (`/auth/...`, `/rent/...`, `/admin/...`). */
function parseDemoTarget(href: string): { section: string; tab: string | null } | null {
  const path = href.split(/[?#]/)[0] ?? "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [prefix, section, tab] = parts;
  if (prefix !== "portal" && prefix !== "resident") return null;
  return { section: section!, tab: tab ?? null };
}

function definitionForRole(role: DemoPortalRole): PortalDefinition {
  if (role === "resident") {
    return {
      kind: "resident",
      basePath: RESIDENT_PORTAL_BASE_PATH,
      title: "Resident Portal",
      accent: "blue",
      sections: RESIDENT_APPROVED_PORTAL_SECTIONS,
    };
  }
  return proPortal;
}

const ROLES: { id: DemoPortalRole; label: string }[] = [
  { id: "resident", label: "Resident" },
  { id: "manager", label: "Manager" },
];

/** Sections the auto-play tour steps through (sidebar order, minus Settings). */
function tourSections(def: PortalDefinition): string[] {
  return def.sections.map((s) => s.section).filter((s) => s !== "profile" && s !== "relationships");
}

const TOUR_PROMPTS = [
  "Who is late on rent right now?",
  "How many leases are awaiting signature?",
];

type Step =
  | { type: "section"; section: string }
  | { type: "showcase"; kind: ShowcaseKind }
  | { type: "assistant"; prompt: string };

/** How long each step is held on screen (ms). */
const STEP_DELAY: Record<Step["type"], number> = {
  section: 2600,
  showcase: 6600,
  assistant: 9000,
};

/**
 * Build the ordered auto-play script: walk every tour section in registry order,
 * and right after the relevant tab, drop in a scripted showcase that demonstrates
 * a real flow working — creating a listing (after Properties) and a rent payment
 * clearing (after Payments) — then finish with a couple of live assistant asks.
 */
function buildSteps(def: PortalDefinition): Step[] {
  const steps: Step[] = [];
  for (const section of tourSections(def)) {
    steps.push({ type: "section", section });
    if (section === "properties") steps.push({ type: "showcase", kind: "listing" });
    if (section === "payments") steps.push({ type: "showcase", kind: "payment" });
  }
  for (const prompt of TOUR_PROMPTS) steps.push({ type: "assistant", prompt });
  return steps;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function DemoPortalShell() {
  const role = useSyncExternalStore(subscribeDemoRole, getDemoRole, () => "manager" as const);
  const def = useMemo(() => definitionForRole(role), [role]);
  // Same nav count badges as the real portal sidebar, fed by the seeded stores.
  const navCounts = usePortalNavCounts(def.kind);
  const navGroups = useMemo(
    () => groupNavItems(def.kind, def.sections.map((s) => ({ section: s.section, meta: s }))),
    [def],
  );
  // Match the real portal sidebar: the trailing unlabeled group (Feedback) is
  // pushed to the bottom, separate from the Team group above it.
  const firstTrailingGroupIdx = useMemo(
    () => navGroups.findIndex((g) => g.id === "account" || g.id === "more"),
    [navGroups],
  );

  // The demo frame element — reused portal modals portal into it (see
  // PortalContainerProvider below) so they stay bounded inside the demo screen
  // instead of covering the whole browser.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  // Collapsible sidebar, mirroring the real PortalSidebar "«/»" toggle.
  const [collapsed, setCollapsed] = useState(false);

  const [section, setSection] = useState<string>("dashboard");
  const [tab, setTab] = useState<string | null>(null);
  const meta: PortalSection | undefined = useMemo(
    () => def.sections.find((s) => s.section === section),
    [def, section],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const selectSection = useCallback((next: string, nextTab: string | null = null) => {
    setSection(next);
    setTab(nextTab);
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  // Resolve an intercepted in-app href to an in-demo section switch. Unknown
  // sections (or auth/rent routes) are swallowed so the visitor never leaves.
  const navigateInDemo = useCallback(
    (href: string) => {
      const target = parseDemoTarget(href);
      if (target && def.sections.some((s) => s.section === target.section)) {
        selectSection(target.section, target.tab);
      }
    },
    [def, selectSection],
  );

  // The reused portal panels render real <Link>/<a> elements pointing at
  // /portal, /resident, etc. A capture-phase handler on the demo frame catches
  // those clicks before Next's Link navigates, so nothing escapes the sandbox.
  const onFrameClickCapture = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!DEMO_INTERCEPT_HREF.test(href)) return;
      e.preventDefault();
      navigateInDemo(href);
    },
    [navigateInDemo],
  );

  // Programmatic navigations (router.push via usePortalNavigate / portalNavClick)
  // can't be caught by a click handler, so those code paths dispatch this event
  // in demo mode instead of pushing a route.
  useEffect(() => {
    const handler = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href;
      if (typeof href === "string") navigateInDemo(href);
    };
    window.addEventListener(DEMO_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(DEMO_NAVIGATE_EVENT, handler);
  }, [navigateInDemo]);

  // --- Run demo auto-play ----------------------------------------------------
  const steps: Step[] = useMemo(() => buildSteps(def), [def]);

  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // The scripted feature demo (listing / payment) currently overlaying the frame.
  const [showcase, setShowcase] = useState<ShowcaseKind | null>(null);

  const switchRole = useCallback(
    (next: DemoPortalRole) => {
      setRunning(false);
      setStepIndex(0);
      setShowcase(null);
      closeAxisAssistant();
      setDemoRole(next);
      setSection("dashboard");
      setTab(null);
    },
    [],
  );

  useEffect(() => {
    if (!running) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear any showcase overlay when the tour stops
      setShowcase(null);
      return;
    }
    const step = steps[stepIndex];
    if (!step) {
      setRunning(false);
      return;
    }
    if (step.type === "section") {
      setShowcase(null);
      const firstTab = def.sections.find((s) => s.section === step.section)?.tabs[0]?.id ?? null;
      selectSection(step.section, firstTab);
    } else if (step.type === "showcase") {
      // Keep the underlying panel (Properties / Payments) and overlay the demo.
      setShowcase(step.kind);
    } else {
      setShowcase(null);
      sendAxisAssistantPrompt(step.prompt);
    }
    const id = window.setTimeout(() => setStepIndex((i) => i + 1), STEP_DELAY[step.type]);
    return () => window.clearTimeout(id);
  }, [running, stepIndex, steps, def, selectSection]);

  const startTour = useCallback(() => {
    closeAxisAssistant();
    selectSection("dashboard", null);
    setStepIndex(0);
    setRunning(true);
  }, [selectSection]);

  const pauseTour = useCallback(() => setRunning(false), []);
  const resumeTour = useCallback(() => setRunning(true), []);
  const restartTour = useCallback(() => {
    setRunning(false);
    closeAxisAssistant();
    selectSection("dashboard", null);
    setStepIndex(0);
    // Re-arm on the next tick so the effect re-runs from the top.
    window.setTimeout(() => setRunning(true), 60);
  }, [selectSection]);

  const finished = stepIndex >= steps.length;

  return (
    <PortalContainerProvider container={frameEl}>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-4">
      {/* Controls bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => switchRole(r.id)}
              data-attr={`demo-role-${r.id}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 font-medium transition",
                role === r.id ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground",
              )}
              aria-pressed={role === r.id}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">Interactive demo — click anything</span>
          {!running ? (
            <button
              type="button"
              onClick={finished || stepIndex === 0 ? startTour : resumeTour}
              data-attr="demo-run"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              style={{ background: "var(--btn-primary)" }}
            >
              <PlayIcon />
              {stepIndex === 0 || finished ? "Run demo" : "Resume"}
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseTour}
              data-attr="demo-pause"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent/60"
            >
              <PauseIcon />
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={restartTour}
            data-attr="demo-restart"
            aria-label="Restart demo"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-muted transition hover:bg-accent/60 hover:text-foreground"
          >
            <RestartIcon />
          </button>
        </div>
      </div>

      {/* Portal window */}
      <div
        ref={setFrameEl}
        onClickCapture={onFrameClickCapture}
        className="demo-portal-frame relative flex min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-lg,0_20px_60px_-30px_rgba(15,23,42,0.5))]"
      >
        {/* Sidebar */}
        <aside
          className={cn(
            "hidden shrink-0 flex-col border-r border-border bg-background glass-nav transition-[width] duration-200 md:flex",
            collapsed ? "w-[58px]" : "w-[208px]",
          )}
        >
          {collapsed ? (
            <div className="flex h-12 shrink-0 items-center justify-center border-b border-border">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
                aria-expanded={false}
                data-attr="demo-sidebar-expand"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-accent/70 hover:text-foreground"
              >
                <ChevronsRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <span className="text-sm font-semibold text-foreground">Axis</span>
              <span className="rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                {role === "resident" ? "Resident" : "Manager"}
              </span>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                aria-expanded
                data-attr="demo-sidebar-collapse"
                className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-accent/70 hover:text-foreground"
              >
                <ChevronsLeft className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          <nav
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2",
              collapsed ? "items-center px-2" : "px-2",
            )}
            aria-label="Demo sections"
          >
            {navGroups.map((group, i) => (
              <div
                key={group.id}
                className={cn(
                  "flex w-full flex-col gap-0.5",
                  collapsed && "items-center",
                  i === firstTrailingGroupIdx ? "mt-auto pt-2" : i > 0 && "mt-1",
                )}
              >
                {group.label && !collapsed ? (
                  <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted/70">
                    {group.label}
                  </p>
                ) : null}
                {collapsed && i > 0 ? <div className="my-1 h-px w-6 bg-border" aria-hidden /> : null}
                {group.items.map((item) => {
                  const active = section === item.section;
                  const count = navCounts[item.section] ?? 0;
                  return (
                    <button
                      key={item.section}
                      type="button"
                      data-attr={`demo-nav-${item.section}`}
                      onClick={() => selectSection(item.section, item.meta.tabs[0]?.id ?? null)}
                      title={collapsed ? item.meta.label : undefined}
                      className={cn(
                        collapsed
                          ? "relative grid h-9 w-9 place-items-center rounded-[12px] transition"
                          : "relative flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-[13px] font-medium transition",
                        active
                          ? "bg-[var(--glass-fill)] text-foreground ring-1 ring-border/60 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
                          : "text-muted hover:bg-accent/70 hover:text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className={active ? "text-primary" : "opacity-80"} aria-hidden>
                        <PortalNavIcon section={item.section} className="h-[17px] w-[17px] shrink-0" />
                      </span>
                      {collapsed ? null : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.meta.label}</span>
                          <PortalNavCountBadge count={count} />
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile section strip */}
        <div className="absolute inset-x-0 top-0 z-10 border-b border-border bg-background/95 backdrop-blur md:hidden">
          <nav className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Demo sections">
            {def.sections
              .filter((s) => s.section !== "profile")
              .map((s) => {
                const active = section === s.section;
                return (
                  <button
                    key={s.section}
                    type="button"
                    onClick={() => selectSection(s.section, s.tabs[0]?.id ?? null)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition",
                      active ? "bg-primary text-white" : "bg-accent/50 text-muted",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
          </nav>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-3 pb-8 pt-14 sm:px-5 md:pt-5">
          {/* No generic sub-tab strip here: every multi-tab panel renders its own
              tab row (TabNav / status pills) in its page-shell header, and those
              tab clicks are intercepted (onFrameClickCapture / DEMO_NAVIGATE_EVENT)
              to switch the demo tab. A strip here would duplicate that row. */}
          <DemoSectionRenderer key={`${role}:${section}`} role={role} section={section} tab={tab} meta={meta} />
        </div>

        {/* Scripted feature demo (listing / payment), overlaid within the frame */}
        {showcase ? <DemoShowcaseOverlay kind={showcase} /> : null}

        {/* In-demo, portal-scoped Axis Assistant — pinned bottom-right INSIDE the
            frame, exactly where it lives in the real property portal. Answers
            questions about this demo portfolio via the sandboxed demo-chat. */}
        <DemoFrameAssistant />
      </div>
    </div>
    </PortalContainerProvider>
  );
}
