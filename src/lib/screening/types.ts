import type { RentalWizardFormState } from "@/lib/rental-application/types";

export type ScreeningProviderId = "certn";

export type ScreeningMode = "off" | "auto_on_submit" | "manual";

export type ManagerScreeningSettings = {
  mode: ScreeningMode;
};

export type ScreeningOrderStatus = "queued" | "in_progress" | "complete" | "failed" | "canceled";

export type ScreeningCreditRating = "excellent" | "good" | "fair" | "poor" | "unknown";

export type ScreeningRecommendation = "strong_yes" | "review" | "concerns" | "not_available";

export type ApplicationScreeningReport = {
  provider: ScreeningProviderId;
  externalOrderId: string;
  status: ScreeningOrderStatus;
  orderedAt: string;
  completedAt?: string;
  costCents?: number;
  creditScore?: number | null;
  creditRating?: ScreeningCreditRating;
  criminalFlags?: number;
  evictionFlags?: number;
  incomeVerified?: boolean;
  recommendation: ScreeningRecommendation;
  pros: string[];
  cons: string[];
  summary: string;
  reportUrl?: string;
  adverseActionRequired?: boolean;
  stripePaymentIntentId?: string;
};

export type ScreeningApplicantInput = {
  applicationId: string;
  managerUserId: string;
  application: RentalWizardFormState;
  monthlyRentCents?: number | null;
};

export type ScreeningProviderOrderResult = {
  externalOrderId: string;
  status: ScreeningOrderStatus;
  reportUrl?: string;
};

export type ScreeningProviderReport = {
  externalOrderId: string;
  status: ScreeningOrderStatus;
  creditScore?: number | null;
  creditRating?: ScreeningCreditRating;
  criminalFlags?: number;
  evictionFlags?: number;
  incomeVerified?: boolean;
  reportUrl?: string;
  rawResult?: string | null;
  rawResultLabel?: string | null;
};

export interface ScreeningProvider {
  id: ScreeningProviderId;
  createOrder(input: ScreeningApplicantInput): Promise<ScreeningProviderOrderResult>;
  fetchReport(externalOrderId: string): Promise<ScreeningProviderReport | null>;
  parseWebhookPayload(payload: unknown): ScreeningProviderReport | null;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}
