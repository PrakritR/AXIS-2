"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/** Flat public marketing canvas — no nested card chrome around tour/message flows. */
export const PUBLIC_PROSPECT_CANVAS_CLASS = "mt-8 space-y-6";

export function ProspectPublicSuccessBanner({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border px-5 py-5 portal-banner-success">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function ProspectAccountHandoff({
  title,
  description,
  createAccountHref,
  signInHref,
  createAccountDataAttr,
  signInDataAttr,
}: {
  title: string;
  description: string;
  createAccountHref: string;
  signInHref: string;
  createAccountDataAttr: string;
  signInDataAttr: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="space-y-2.5">
        <Link
          href={createAccountHref}
          data-attr={createAccountDataAttr}
          className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold"
        >
          Create account
        </Link>
        <Link
          href={signInHref}
          data-attr={signInDataAttr}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold text-foreground hover:bg-accent/30"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
