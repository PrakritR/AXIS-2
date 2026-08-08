"use client";

import Link from "next/link";
import { Bell, Camera, MessageSquare, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileAppPreview } from "@/components/marketing/mobile-app-preview";
import { iosAppDownloadIsTestFlight, iosAppDownloadLabel, iosAppDownloadUrl } from "@/lib/ios-app-download";
import { isNativeRuntimeSync } from "@/lib/native/detect-native";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Bell,
    title: "Push notifications",
    body: "Rent reminders, new applications, and inbox replies reach you instantly.",
  },
  {
    icon: MessageSquare,
    title: "Communication on the go",
    body: "Reply to residents and vendors from the same unified inbox as the web portal.",
  },
  {
    icon: Camera,
    title: "Camera-ready uploads",
    body: "Snap listing photos and maintenance attachments without leaving the app.",
  },
] as const;

export function MobileAppDownloadPanel({
  className,
  compact = false,
  showPortalLink = false,
}: {
  className?: string;
  /** Tighter layout for inline promos (footer strip, auth chrome). */
  compact?: boolean;
  /** Offer opening the manager portal App tab when already signed in on web. */
  showPortalLink?: boolean;
}) {
  const inNativeShell = isNativeRuntimeSync();
  const downloadUrl = iosAppDownloadUrl();
  const testFlight = iosAppDownloadIsTestFlight(downloadUrl);

  if (inNativeShell) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border bg-accent/20 px-5 py-6 text-center sm:px-8",
          className,
        )}
        data-attr="mobile-app-download-installed"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">You&apos;re in the PropLane app</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This install loads the same manager and resident portals you use on the web — with push
          notifications and native camera access.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
        data-attr="mobile-app-download-panel"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">Get PropLane on your phone</h2>
          <p className="mt-1 text-sm leading-snug text-muted">
            Push alerts, inbox, and camera uploads — same portal in a native shell.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button asChild variant="primary" className="h-11 min-h-0 rounded-full px-6 text-sm font-semibold">
            <Link href="/app" data-attr="mobile-app-download-learn-more">
              View mobile app
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-8 lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start", className)}>
      <div
        className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8"
        data-attr="mobile-app-download-panel"
      >
        <h2 className="text-2xl font-semibold text-foreground">
          {testFlight ? "Install the PropLane mobile beta" : "Get PropLane on your phone"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Sign in with the same account as the web portal. Your properties, inbox, applications, and calendar stay in
          sync — updates ship instantly without waiting on an app store review for every change.
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-border bg-accent/15 px-4 py-3">
              <Icon className="h-4 w-4 text-primary" strokeWidth={2.25} aria-hidden />
              <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            asChild
            variant="primary"
            className="h-11 min-h-0 rounded-full px-6 text-sm font-semibold"
            data-attr="mobile-app-download-cta"
          >
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              {iosAppDownloadLabel(downloadUrl)}
            </a>
          </Button>
          {showPortalLink ? (
            <Button asChild variant="outline" className="h-11 min-h-0 rounded-full px-6 text-sm">
              <Link href="/portal/app" data-attr="mobile-app-download-portal-tab">
                Open in manager portal
              </Link>
            </Button>
          ) : null}
          {testFlight ? (
            <p className="text-[11px] leading-snug text-muted sm:max-w-xs">
              TestFlight builds are for internal testers. Sign in with your PropLane manager or resident account after
              installing.
            </p>
          ) : null}
        </div>
      </div>

      <MobileAppPreview className="lg:justify-self-end" />
    </div>
  );
}

/** @deprecated Use MobileAppDownloadPanel */
export const IosAppDownloadPanel = MobileAppDownloadPanel;

/** Compact web-only promo — hidden inside the native shell via `.native-hide`. */
export function MobileAppPromoStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "native-hide flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3",
        className,
      )}
      data-attr="mobile-app-promo-strip"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">PropLane mobile app</p>
        <p className="text-xs text-muted">Push alerts, inbox, and camera uploads — same portal, native shell.</p>
      </div>
      <Button asChild variant="outline" className="h-9 min-h-0 shrink-0 rounded-full px-4 text-xs font-semibold">
        <Link href="/app" data-attr="mobile-app-promo-strip-cta">
          View app
        </Link>
      </Button>
    </div>
  );
}

/** @deprecated Use MobileAppPromoStrip */
export const IosAppPromoStrip = MobileAppPromoStrip;
