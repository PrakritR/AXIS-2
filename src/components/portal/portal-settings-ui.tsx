"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function PortalSettingsSections({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-8 [html[data-native]_&]:space-y-6", className)}>{children}</div>;
}

export function PortalSettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PortalSettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-sm", className)}>{children}</div>
  );
}

export function PortalSettingsRow({
  label,
  description,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border px-4 py-3.5 last:border-0",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export function PortalSettingsField({
  label,
  value,
  mono,
  action,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3.5 last:border-0">
      <span className="w-[7.5rem] shrink-0 pt-0.5 text-sm text-muted sm:w-32">{label}</span>
      <div className="flex min-w-0 flex-1 items-start justify-end gap-3 sm:justify-between">
        <span
          className={cn(
            "min-w-0 text-sm font-medium text-foreground sm:text-left",
            mono ? "break-all font-mono text-xs leading-relaxed" : "text-right sm:text-left",
          )}
        >
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}

export function PortalSettingsLinkRow({
  label,
  description,
  value,
  href,
  onClick,
}: {
  label: string;
  description?: string;
  value?: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
        {value ? <span className="max-w-[10rem] truncate">{value}</span> : null}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </div>
    </>
  );

  const className =
    "flex w-full items-center justify-between gap-4 border-b border-border px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-accent/40";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function profileInitials(name: string, email: string): string {
  const src = name.trim() || email.trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function PortalSettingsProfileHeader({
  name,
  email,
  action,
}: {
  name: string;
  email: string;
  action?: ReactNode;
}) {
  const displayName = name.trim() || "Account";
  return (
    <PortalSettingsGroup>
      <div className="flex items-center gap-4 px-4 py-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {profileInitials(name, email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
          {email ? <p className="truncate text-sm text-muted">{email}</p> : null}
        </div>
        {action}
      </div>
    </PortalSettingsGroup>
  );
}

export function PortalSettingsFormBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4 px-4 py-4", className)}>{children}</div>;
}
