"use client";

import { useState } from "react";
import { AxisAssistant } from "@/components/portal/axis-assistant";
import { DemoPortalShell } from "@/components/demo/demo-portal-shell";
import { seedDemoPortalData } from "@/lib/demo/demo-seed";
import { DEMO_MANAGER_NAME } from "@/lib/demo/demo-session";

export function DemoPortalExperience() {
  // Seed the demo stores during the first client render, before the portal
  // panels mount and read them. Idempotent + a no-op on the server / off /demo.
  useState(() => {
    seedDemoPortalData();
    return true;
  });

  return (
    <AxisAssistant managerName={DEMO_MANAGER_NAME} endpoint="/api/agent/demo-chat">
      <section className="mx-auto w-full max-w-6xl px-4 pt-8 text-center sm:pt-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
          Live interactive demo
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          See the Axis property portal in action
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Explore a fully-loaded manager, admin, and resident portal with realistic data — no login required.
          Switch roles, click through every tab, or hit <span className="font-semibold text-foreground">Run demo</span>{" "}
          for a one-minute guided tour. Then ask the Axis Assistant anything with the ✦ button.
        </p>
      </section>
      <DemoPortalShell />
    </AxisAssistant>
  );
}
