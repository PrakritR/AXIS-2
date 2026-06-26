import {
  certnApiBaseUrl,
  certnApiKey,
  certnApplicationsPath,
  certnWebhookSecret,
} from "@/lib/screening/config";
import { parseCertnReportPayload, verifyCertnWebhookSignature } from "@/lib/screening/parse-certn-report";
import type {
  ScreeningApplicantInput,
  ScreeningProvider,
  ScreeningProviderOrderResult,
  ScreeningProviderReport,
} from "@/lib/screening/types";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Applicant", lastName: "Unknown" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "—" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function normalizeDateOfBirth(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

async function certnRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = `${certnApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${certnApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function buildQuickScreenBody(input: ScreeningApplicantInput): Record<string, unknown> {
  const app = input.application;
  const { firstName, lastName } = splitName(app.fullLegalName);
  const ssn = digitsOnly(app.ssn);
  const phone = digitsOnly(app.phone);

  return {
    request_equifax: true,
    request_us_criminal_record_check_tier_3: true,
    request_softcheck: true,
    us_criminal_record_check_years: 7,
    tag: input.applicationId,
    email: app.email.trim().toLowerCase(),
    information: {
      first_name: firstName,
      last_name: lastName,
      email: app.email.trim().toLowerCase(),
      phone_number: phone || undefined,
      date_of_birth: normalizeDateOfBirth(app.dateOfBirth),
      sin: ssn.length === 9 ? ssn : undefined,
      addresses: [
        {
          address: app.currentStreet.trim(),
          city: app.currentCity.trim(),
          province_state: app.currentState.trim(),
          country: "US",
          postal_code: app.currentZip.trim(),
          current: true,
        },
      ],
    },
    position_or_property_location: {
      address: app.currentStreet.trim(),
      city: app.currentCity.trim(),
      province_state: app.currentState.trim(),
      country: "US",
      postal_code: app.currentZip.trim(),
    },
  };
}

export const certnScreeningProvider: ScreeningProvider = {
  id: "certn",

  async createOrder(input: ScreeningApplicantInput): Promise<ScreeningProviderOrderResult> {
    const response = await certnRequest(certnApplicationsPath(), {
      method: "POST",
      body: JSON.stringify(buildQuickScreenBody(input)),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        (typeof payload.detail === "string" && payload.detail) ||
        (typeof payload.error === "string" && payload.error) ||
        `Certn order failed (${response.status}).`;
      throw new Error(message);
    }

    const externalOrderId = typeof payload.id === "string" ? payload.id : null;
    if (!externalOrderId) throw new Error("Certn did not return an application id.");

    const applicant = payload.applicant as Record<string, unknown> | undefined;
    const reportUrl = typeof applicant?.report_url === "string" ? applicant.report_url : undefined;
    const reportStatus = typeof payload.report_status === "string" ? payload.report_status.toUpperCase() : "";
    const status =
      reportStatus === "COMPLETE" || reportStatus === "COMPLETED" ? "complete" : ("in_progress" as const);

    return { externalOrderId, status, reportUrl };
  },

  async fetchReport(externalOrderId: string): Promise<ScreeningProviderReport | null> {
    const response = await certnRequest(`/pm/v1/applications/${encodeURIComponent(externalOrderId)}/`);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return parseCertnReportPayload(payload);
  },

  parseWebhookPayload(payload: unknown): ScreeningProviderReport | null {
    return parseCertnReportPayload(payload);
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    return verifyCertnWebhookSignature(rawBody, signatureHeader, certnWebhookSecret());
  },
};
