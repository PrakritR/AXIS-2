/** Canonical App Store Connect record for PropLane iOS (see docs/mobile-app.md). */
export const IOS_APP_STORE_APP_ID = "6795707576";

export const IOS_APP_BUNDLE_ID = "space.proplane.app";

const DEFAULT_IOS_APP_DOWNLOAD_URL = `https://apps.apple.com/app/id${IOS_APP_STORE_APP_ID}`;

/**
 * Public download destination for the PropLane iOS app.
 * Override with `NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL` (TestFlight public link or App Store URL).
 */
export function iosAppDownloadUrl(): string {
  const override = process.env.NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL?.trim();
  if (override) return override;
  return DEFAULT_IOS_APP_DOWNLOAD_URL;
}

export function iosAppDownloadIsTestFlight(url = iosAppDownloadUrl()): boolean {
  return /testflight\.apple\.com/i.test(url);
}

export function iosAppDownloadLabel(url = iosAppDownloadUrl()): string {
  return iosAppDownloadIsTestFlight(url) ? "Join the iOS beta on TestFlight" : "Download on the App Store";
}
