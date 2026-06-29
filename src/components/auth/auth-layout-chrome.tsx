"use client";

import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { useSyncExternalStore } from "react";

function shouldHideAuthSiteChrome(): boolean {
  if (typeof document === "undefined") return false;
  if (detectNativePlatformSync()) return true;
  return document.documentElement.hasAttribute("data-auth-welcome");
}

function subscribeAuthChrome(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-auth-welcome", "data-native"],
  });
  return () => observer.disconnect();
}

function useHideAuthSiteChrome(): boolean {
  return useSyncExternalStore(subscribeAuthChrome, shouldHideAuthSiteChrome, () => false);
}

export function AuthLayoutSubstrate() {
  const hidden = useHideAuthSiteChrome();
  if (hidden) return null;
  return <ChromeSubstrate variant="full" />;
}

export function AuthLayoutFooter() {
  const hidden = useHideAuthSiteChrome();
  if (hidden) return null;
  return (
    <div className="auth-layout-footer">
      <PublicFooter compact />
    </div>
  );
}
