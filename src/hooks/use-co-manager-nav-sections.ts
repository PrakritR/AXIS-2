"use client";

import { useEffect, useMemo, useState } from "react";
import { countManagerManagedPropertiesForUser } from "@/lib/demo-property-pipeline";
import {
  coManagerPortalSectionAllowed,
  mergeCoManagerPermissions,
} from "@/lib/co-manager-permissions";
import { readProRelationships } from "@/lib/pro-relationships";
import type { PortalDefinition } from "@/lib/portal-types";

const REFRESH_EVENTS = ["axis-pro-relationships", "axis-property-pipeline", "storage"] as const;

export function useCoManagerNavSections(definition: PortalDefinition, userId: string | null) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId || (definition.kind !== "pro" && definition.kind !== "manager")) return;
    const bump = () => setTick((n) => n + 1);
    for (const ev of REFRESH_EVENTS) window.addEventListener(ev, bump);
    return () => {
      for (const ev of REFRESH_EVENTS) window.removeEventListener(ev, bump);
    };
  }, [definition.kind, userId]);

  return useMemo(() => {
    void tick;
    if (!userId || (definition.kind !== "pro" && definition.kind !== "manager")) {
      return definition.sections;
    }

    const isPrimaryManager = countManagerManagedPropertiesForUser(userId) > 0;
    const mergedPermissions = mergeCoManagerPermissions(readProRelationships(userId));

    return definition.sections.filter((s) =>
      coManagerPortalSectionAllowed({
        section: s.section,
        isPrimaryManager,
        mergedPermissions,
      }),
    );
  }, [definition, tick, userId]);
}
