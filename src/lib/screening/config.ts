import type { ScreeningProviderId } from "@/lib/screening/types";

export function screeningProviderId(): ScreeningProviderId {
  const raw = process.env.SCREENING_PROVIDER?.trim().toLowerCase();
  return raw === "certn" || !raw ? "certn" : "certn";
}

export function screeningCostCents(): number {
  const raw = Number(process.env.SCREENING_COST_CENTS ?? "3999");
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 3999;
}

export function screeningConfigured(): boolean {
  return Boolean(process.env.CERTN_API_KEY?.trim());
}

export function certnApiKey(): string {
  const key = process.env.CERTN_API_KEY?.trim();
  if (!key) throw new Error("CERTN_API_KEY is not configured.");
  return key;
}

export function certnApiBaseUrl(): string {
  return (process.env.CERTN_API_BASE_URL?.trim() || "https://api.certn.co").replace(/\/$/, "");
}

export function certnApplicationsPath(): string {
  return process.env.CERTN_APPLICATIONS_PATH?.trim() || "/pm/v1/applications/quick";
}

export function certnWebhookSecret(): string | null {
  const secret = process.env.CERTN_WEBHOOK_SECRET?.trim();
  return secret || null;
}
