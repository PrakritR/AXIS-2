import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** iOS native OAuth uses ASWebAuthenticationSession instead of SFSafariViewController. */
export function usesIosAsWebAuthenticationSession(): boolean {
  return detectNativePlatformSync() === "ios";
}
