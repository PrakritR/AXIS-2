import { certnScreeningProvider } from "@/lib/screening/providers/certn";
import type { ScreeningProvider } from "@/lib/screening/types";
import { screeningProviderId } from "@/lib/screening/config";

export function getScreeningProvider(): ScreeningProvider {
  const id = screeningProviderId();
  if (id === "certn") return certnScreeningProvider;
  return certnScreeningProvider;
}
