"use client";

import { useState } from "react";
import { DemoPortalShell } from "@/components/demo/demo-portal-shell";
import { seedDemoPortalData } from "@/lib/demo/demo-seed";

export function DemoPortalExperience() {
  // Seed the demo stores during the first client render, before the portal
  // panels mount and read them. Idempotent + a no-op on the server / off /demo.
  useState(() => {
    seedDemoPortalData();
    return true;
  });

  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pt-8 text-center sm:pt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          See the Axis property portal in action
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Explore a fully-loaded manager, resident, and vendor portal with realistic data — no login required.
          Switch roles, click through every tab, or hit <span className="font-semibold text-foreground">Run demo</span>{" "}
          for a one-minute guided tour. Ask the in-portal <span className="font-semibold text-foreground">Axis Assistant</span> (✦,
          bottom-right of the demo) about this portfolio, or the <span className="font-semibold text-foreground">Ask Axis AI</span>{" "}
          button for general questions.
        </p>
      </section>
      {/* The in-demo, portal-scoped assistant is mounted INSIDE the frame by
          DemoPortalShell. The site-wide general assistant is mounted at the root
          layout, so it appears bottom-right of the full page here too. */}
      <DemoPortalShell />
    </>
  );
}
