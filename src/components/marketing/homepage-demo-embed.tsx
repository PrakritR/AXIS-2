"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoPortalShell } from "@/components/demo/demo-portal-shell";
import { isDemoSignedIn } from "@/lib/demo/demo-client-teardown";

/**
 * Homepage demo embed. Signed-OUT visitors get the live interactive demo. A
 * signed-in visitor instead gets a "return to your portal" panel: the demo does
 * not seed for signed-in users (it would risk writing demo rows into their real
 * portal stores — see demo-seed.ts), so showing them an empty demo frame would
 * look broken. Defaults to the demo on the server / first paint so signed-out
 * visitors and crawlers see it immediately; swaps in the panel only once the
 * client confirms a live session.
 */
export function HomepageDemoEmbed() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(isDemoSignedIn());
  }, []);

  if (signedIn) {
    return (
      <div className="relative mx-auto max-w-3xl px-4 sm:px-5">
        <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-[var(--shadow-card)]">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Welcome back
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            You&rsquo;re signed in. Jump straight into your portal. The live demo below is for
            exploring PropLane without an account.
          </p>
          <div className="mt-6">
            <Link
              href="/portal"
              data-attr="home-signed-in-open-portal"
              className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99]"
            >
              Open your portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <DemoPortalShell />;
}
