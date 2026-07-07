"use client";

import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { PublicFooter } from "@/components/layout/public-footer";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { useSyncExternalStore } from "react";

function shouldHideAuthFooter(): boolean {
  if (typeof document === "undefined") return false;
  if (detectNativePlatformSync()) return true;
  return document.documentElement.hasAttribute("data-auth-welcome");
}

function shouldHideAuthSubstrate(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute("data-auth-native")) return false;
  return document.documentElement.hasAttribute("data-auth-welcome");
}

function subscribeAuthChrome(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-auth-welcome", "data-auth-native", "data-native"],
  });
  return () => observer.disconnect();
}

function useHideAuthFooter(): boolean {
  return useSyncExternalStore(subscribeAuthChrome, shouldHideAuthFooter, () => false);
}

function useHideAuthSubstrate(): boolean {
  return useSyncExternalStore(subscribeAuthChrome, shouldHideAuthSubstrate, () => false);
}

export function AuthLayoutSubstrate() {
  const hidden = useHideAuthSubstrate();
  if (hidden) return null;
  return <ChromeSubstrate variant="full" />;
}

export function AuthLayoutFooter() {
  const hidden = useHideAuthFooter();
  if (hidden) return null;
  return (
    <div className="auth-layout-footer">
      <PublicFooter compact />
    </div>
  );
}
