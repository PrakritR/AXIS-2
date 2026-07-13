"use client";

import { useEffect, useState } from "react";
import { isDemoSignedIn } from "@/lib/demo/demo-client-teardown";

/**
 * Renders its children only for signed-OUT visitors. Used on the landing page
 * to hide the "Get started" conversion CTAs from people who already have an
 * account (they see the "Welcome back → Open your portal" panel instead).
 * Defaults to visible on the server / first paint so signed-out visitors and
 * crawlers always see the CTAs; hides only once the client confirms a session.
 */
export function SignedOutOnly({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(isDemoSignedIn());
  }, []);

  if (signedIn) return null;
  return <>{children}</>;
}
