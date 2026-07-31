import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { Capacitor } from "@capacitor/core";

/** iOS native OAuth uses ASWebAuthenticationSession instead of SFSafariViewController. */
export function usesIosAsWebAuthenticationSession(): boolean {
  if (detectNativePlatformSync() !== "ios") return false;
  try {
    return Capacitor.isPluginAvailable("WebAuthSession");
  } catch {
    return false;
  }
}
