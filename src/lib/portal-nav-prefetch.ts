/** Turbopack recompiles each dynamic import in dev — skip background warming locally. */
export function portalBackgroundPrefetchEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Mobile tab bar: avoid route prefetch competing with the tab the user just tapped. */
export function portalMobileLinkPrefetchEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}
