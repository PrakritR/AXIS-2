"use client";

import { DemoPortalShell } from "@/components/demo/demo-portal-shell";

export function DemoPortalExperience() {
  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pt-8 text-center sm:pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          See the PropLane property portal in action
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Explore a fully-loaded manager, resident, and vendor portal with realistic data — no login required.
          Switch roles and click through every tab, or hit <span className="font-semibold text-foreground">Run demo</span>{" "}
          for a guided walkthrough that builds the portfolio step by step. Ask the in-portal{" "}
          <span className="font-semibold text-foreground">PropLane Assistant</span> (✦, bottom-right of the demo) about this
          portfolio, or the <span className="font-semibold text-foreground">Ask PropLane AI</span> button for general questions.
        </p>
      </section>
      {/* The in-demo, portal-scoped assistant is mounted INSIDE the frame by
          DemoPortalShell. The site-wide general assistant is mounted at the root
          layout, so it appears bottom-right of the full page here too. */}
      <DemoPortalShell />
    </>
  );
}
