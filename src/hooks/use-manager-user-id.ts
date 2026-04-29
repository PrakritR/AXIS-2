"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

/**
 * Signed-in Supabase user id for scoping manager localStorage data.
 * Returns null while loading or when not signed in.
 */
export function useManagerUserId(initial?: {
  userId?: string | null;
  email?: string | null;
}): { userId: string | null; email: string | null; ready: boolean } {
  const [userId, setUserId] = useState<string | null>(initial?.userId ?? null);
  const [email, setEmail] = useState<string | null>(initial?.email ?? null);
  const [ready, setReady] = useState(Boolean(initial?.userId));

  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      queueMicrotask(() => setReady(true));
      return;
    }

    let cancelled = false;

    void (async () => {
      // Fast path: read from the local session cache (no network round-trip).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setUserId(session?.user?.id ?? null);
        setEmail(session?.user?.email ?? null);
        setReady(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!cancelled) {
        setUserId(session?.user?.id ?? null);
        setEmail(session?.user?.email ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { userId, email, ready };
}
