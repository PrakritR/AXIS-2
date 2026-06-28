"use client";

import { useEffect, useState } from "react";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";

/** Paint the hero quickly, then enable the animated chrome after navigation settles. */
export function HeroChromeSubstrate() {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const run = () => setAnimated(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 400 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, []);

  return <ChromeSubstrate variant={animated ? "full" : "quiet"} />;
}
