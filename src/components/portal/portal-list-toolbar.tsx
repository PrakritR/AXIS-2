"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { PORTAL_INBOX_LIST_TOOLBAR_CLASS } from "@/components/portal/portal-inbox-ui";

/** Compact list chrome below page filters: optional segment tabs, search, extras. */
export function PortalListToolbar({
  statusPills,
  search,
  children,
  className,
}: {
  statusPills?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    dataAttr?: string;
    ariaLabel?: string;
  };
  children?: ReactNode;
  className?: string;
}) {
  if (!statusPills && !search && !children) return null;

  return (
    <div className={`${PORTAL_INBOX_LIST_TOOLBAR_CLASS} ${className ?? ""}`.trim()}>
      {statusPills}
      {search ? (
        <Input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          aria-label={search.ariaLabel ?? search.placeholder}
          className="portal-list-search h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          data-attr={search.dataAttr ?? "portal-list-search"}
        />
      ) : null}
      {children}
    </div>
  );
}
