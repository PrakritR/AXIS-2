"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useEffect, useState } from "react";

/**
 * Signed-in Supabase user id for scoping manager demo data (localStorage).
 * Returns null while loading or when not signed in.
 */
export function useManagerUserId(): { userId: string | null; ready: boolean } {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setUserId(user?.id ?? null);
        setReady(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { userId, ready };
}
