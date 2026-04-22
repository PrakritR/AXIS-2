"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useEffect, useState } from "react";

/**
 * Signed-in Supabase user id for scoping manager localStorage data.
 * Returns null while loading or when not signed in.
 */
export function useManagerUserId(): { userId: string | null; email: string | null; ready: boolean } {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      setReady(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setUserId(user?.id ?? null);
        setEmail(user?.email ?? null);
        setReady(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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
