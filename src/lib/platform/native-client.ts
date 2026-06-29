/** Sent by the Capacitor shell so APIs can apply native-only payment rules. */
export const AXIS_NATIVE_PLATFORM_HEADER = "x-axis-native-platform";

export type AxisNativePlatform = "ios" | "android";

export function readNativePlatformHeader(req: Request): AxisNativePlatform | null {
  const raw = req.headers.get(AXIS_NATIVE_PLATFORM_HEADER)?.trim().toLowerCase();
  if (raw === "ios" || raw === "android") return raw;
  return null;
}

export function nativePlatformRequestHeaders(platform: AxisNativePlatform | null): Record<string, string> {
  if (!platform) return {};
  return { [AXIS_NATIVE_PLATFORM_HEADER]: platform };
}
