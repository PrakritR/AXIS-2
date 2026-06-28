"use client";

import { shouldNativeRedirectToWelcome } from "@/lib/auth/native-entry-paths";
import { redirectNativeFromMarketing } from "@/lib/auth/native-welcome-redirect";
import { detectNativePlatformSync, tagHtmlNativePlatform } from "@/lib/native/detect-native";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Hides public marketing pages in the Capacitor shell and routes to auth/portals.
 */
export function NativeMarketingBlocker({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [blocked, setBlocked] = useState(() => {
    const platform = detectNativePlatformSync();
    if (platform) tagHtmlNativePlatform(platform);
    return Boolean(platform && shouldNativeRedirectToWelcome(pathname));
  });

  useEffect(() => {
    const platform = detectNativePlatformSync();
    if (platform) tagHtmlNativePlatform(platform);

    if (!platform) {
      setBlocked(false);
      return;
    }

    if (!shouldNativeRedirectToWelcome(pathname)) {
      setBlocked(false);
      return;
    }

    setBlocked(true);
    const supabase = createSupabaseBrowserClient();
    void redirectNativeFromMarketing(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return { session };
    });
  }, [pathname]);

  if (blocked) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return children;
}
