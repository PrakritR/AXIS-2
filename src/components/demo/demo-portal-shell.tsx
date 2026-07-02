"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { groupNavItems } from "@/lib/portals/nav-groups";
import { proPortal } from "@/lib/portals/pro";
import { RESIDENT_APPROVED_PORTAL_SECTIONS, RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import type { PortalDefinition, PortalSection } from "@/lib/portal-types";
import { closeAxisAssistant, sendAxisAssistantPrompt } from "@/lib/axis-assistant/open-store";
import {
  getDemoRole,
  setDemoRole,
  subscribeDemoRole,
  type DemoPortalRole,
} from "@/lib/demo/demo-session";
import { DemoSectionRenderer } from "@/components/demo/demo-section-renderer";

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

type Step = { type: "section"; section: string } | { type: "assistant"; prompt: string };

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
  const navGroups = useMemo(
    () => groupNavItems(def.kind, def.sections.map((s) => ({ section: s.section, meta: s }))),
    [def],
  );

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

  // --- Run demo auto-play ----------------------------------------------------
  const steps: Step[] = useMemo(() => {
    const s: Step[] = tourSections(def).map((sec) => ({ type: "section", section: sec }));
    for (const prompt of TOUR_PROMPTS) s.push({ type: "assistant", prompt });
    return s;
  }, [def]);

  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const switchRole = useCallback(
    (next: DemoPortalRole) => {
      setRunning(false);
      setStepIndex(0);
      closeAxisAssistant();
      setDemoRole(next);
      setSection("dashboard");
      setTab(null);
    },
    [],
  );

  useEffect(() => {
    if (!running) return;
    const step = steps[stepIndex];
    if (!step) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tour finished; stop the timer-driven autoplay
      setRunning(false);
      return;
    }
    if (step.type === "section") {
      const firstTab = def.sections.find((s) => s.section === step.section)?.tabs[0]?.id ?? null;
      selectSection(step.section, firstTab);
    } else {
      sendAxisAssistantPrompt(step.prompt);
    }
    const delay = step.type === "assistant" ? 9000 : 3400;
    const id = window.setTimeout(() => setStepIndex((i) => i + 1), delay);
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
      <div className="relative flex min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-lg,0_20px_60px_-30px_rgba(15,23,42,0.5))]">
        {/* Sidebar */}
        <aside className="hidden w-[208px] shrink-0 flex-col border-r border-border bg-background glass-nav md:flex">
          <div className="flex h-12 items-center gap-2 border-b border-border px-3">
            <span className="text-sm font-semibold text-foreground">Axis</span>
            <span className="rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              {role === "resident" ? "Resident" : "Manager"}
            </span>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2" aria-label="Demo sections">
            {navGroups.map((group, i) => (
              <div key={group.id} className={cn("flex flex-col gap-0.5", i > 0 && "mt-1")}>
                {group.label ? (
                  <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted/70">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => {
                  const active = section === item.section;
                  return (
                    <button
                      key={item.section}
                      type="button"
                      data-attr={`demo-nav-${item.section}`}
                      onClick={() => selectSection(item.section, item.meta.tabs[0]?.id ?? null)}
                      className={cn(
                        "relative flex min-h-9 items-center gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-[13px] font-medium transition",
                        active
                          ? "bg-[var(--glass-fill)] text-foreground ring-1 ring-border/60 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
                          : "text-muted hover:bg-accent/70 hover:text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className={active ? "text-primary" : "opacity-80"} aria-hidden>
                        <PortalNavIcon section={item.section} className="h-[17px] w-[17px] shrink-0" />
                      </span>
                      <span className="min-w-0 truncate">{item.meta.label}</span>
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
          {/* Sub-tabs for the active section */}
          {meta && meta.tabs.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {meta.tabs.map((t) => {
                const activeTab = (tab ?? meta.tabs[0]?.id) === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      activeTab ? "bg-primary/12 text-primary" : "text-muted hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <DemoSectionRenderer key={`${role}:${section}`} role={role} section={section} tab={tab} meta={meta} />
        </div>
      </div>
    </div>
  );
}
