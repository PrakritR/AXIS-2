"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  demoSessionForRole,
  getDemoRole,
  isDemoModeActive,
  subscribeDemoPath,
  subscribeDemoRole,
} from "@/lib/demo/demo-session";

type PortalSessionSnapshot = {
  userId: string | null;
  email: string | null;
  ready: boolean;
};

let snapshot: PortalSessionSnapshot = {
  userId: null,
  email: null,
  ready: false,
};
let initialized = false;
let authSubscription: { unsubscribe: () => void } | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function updateSnapshot(next: PortalSessionSnapshot) {
  if (
    snapshot.userId === next.userId &&
    snapshot.email === next.email &&
    snapshot.ready === next.ready
  ) {
    return;
  }
  snapshot = next;
  emit();
}

function applySession(session: Session | null) {
  updateSnapshot({
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    ready: true,
  });
}

function ensurePortalSessionStore() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  let supabase: ReturnType<typeof createSupabaseBrowserClient>;
  try {
    supabase = createSupabaseBrowserClient();
  } catch {
    updateSnapshot({ userId: null, email: null, ready: true });
    return;
  }

  void (async () => {
    try {
      const result = await supabase.auth.getSession();
      applySession(result.data.session);
    } catch {
      updateSnapshot({ userId: null, email: null, ready: true });
    }
  })();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    applySession(session);
  });
  authSubscription = subscription;
}

export function usePortalSession(initial?: {
  userId?: string | null;
  email?: string | null;
}): PortalSessionSnapshot {
  const [state, setState] = useState<PortalSessionSnapshot>(() => ({
    userId: snapshot.userId ?? initial?.userId ?? null,
    email: snapshot.email ?? initial?.email ?? null,
    ready: snapshot.ready || Boolean(initial?.userId),
  }));

  // On the public `/demo` sandbox, report a fixed synthetic session for the
  // active demo role so the real portal panels render their seeded data. This
  // never touches Supabase and is scoped to `/demo` by pathname.
  const demoRole = useSyncExternalStore(subscribeDemoRole, getDemoRole, () => "manager" as const);

  const demoActive = useSyncExternalStore(subscribeDemoPath, isDemoModeActive, () => false);

  useEffect(() => {
    if (demoActive) return;
    ensurePortalSessionStore();
    const sync = () => {
      setState({
        userId: snapshot.userId ?? initial?.userId ?? null,
        email: snapshot.email ?? initial?.email ?? null,
        ready: snapshot.ready || Boolean(initial?.userId),
      });
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
      if (listeners.size === 0 && authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
        initialized = false;
      }
    };
  }, [initial?.email, initial?.userId, demoActive]);

  if (demoActive) return demoSessionForRole(demoRole);

  return state;
}
