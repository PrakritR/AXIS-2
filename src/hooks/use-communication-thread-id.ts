"use client";

import { parseCommunicationThreadId } from "@/lib/portal-communication-nav";
import { useEffect, useState } from "react";

/** Client thread id for Communication — survives soft URL updates and browser back. */
export function useCommunicationThreadId(commBase: string, initialThreadId?: string) {
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(initialThreadId);

  useEffect(() => {
    setActiveThreadId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    const syncFromPath = () => {
      setActiveThreadId(parseCommunicationThreadId(window.location.pathname, commBase));
    };
    window.addEventListener("popstate", syncFromPath);
    return () => window.removeEventListener("popstate", syncFromPath);
  }, [commBase]);

  return { activeThreadId, setActiveThreadId };
}
