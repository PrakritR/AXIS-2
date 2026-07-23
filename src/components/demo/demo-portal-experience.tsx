"use client";

import { DemoPortalShell } from "@/components/demo/demo-portal-shell";

export function DemoPortalExperience() {
  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-5 pt-10 text-center sm:px-6 sm:pt-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--secondary)] px-3 py-1 text-[12px] font-medium tracking-[0.06em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_45%,transparent)]" />
          LIVE DEMO · NO SIGNUP
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[3rem]">
          Try the live product
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-[15.5px]">
          The real manager, resident, and vendor portals, running on an empty sandbox. No login required.
          Switch roles and click through every tab, or hit{" "}
          <span className="font-medium text-foreground">Run demo</span> for a guided walkthrough that lists a
          property, takes an application, and signs a lease in front of you. The{" "}
          <span className="font-medium text-foreground">Ask PropLane AI</span> button and the in-portal{" "}
          <span className="font-medium text-primary">PropLane Assistant</span> (✦, bottom-right of the demo) both
          answer questions about how PropLane works.
        </p>
      </section>
      {/* The in-demo, portal-scoped assistant is mounted INSIDE the frame by
          DemoPortalShell. The site-wide general assistant is mounted at the root
          layout, so it appears bottom-right of the full page here too. */}
      <DemoPortalShell />
    </>
  );
}
