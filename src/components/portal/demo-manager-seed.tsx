"use client";

import { useEffect } from "react";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ensureDemoManagerSessionSeed } from "@/lib/demo-manager-session-seed";

export function DemoManagerSeedEffect() {
  const { userId, ready } = useManagerUserId();
  useEffect(() => {
    if (!ready || !userId) return;
    ensureDemoManagerSessionSeed(userId);
  }, [ready, userId]);
  return null;
}
