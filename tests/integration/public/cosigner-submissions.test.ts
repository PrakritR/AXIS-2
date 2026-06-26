import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/cosigner-notification.server", () => ({
  notifyManagerCosignerSubmitted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST as cosignerSubmit } from "@/app/api/public/cosigner-submissions/route";

const baseSubmission = {
  signerAppId: "AXIS-TEST1234",
  signerFullName: "Primary Applicant",
  fullName: "Co Signer",
  email: "cosigner@example.com",
  phone: "2065550100",
  dob: "1990-01-01",
  dlNumber: "DL123",
  ssn: "123-45-6789",
  address: "1 Main St",
  city: "Seattle",
  state: "WA",
  zip: "98101",
  notEmployed: false,
  employerName: "Acme",
  employerAddress: "2 Work St",
  supervisorName: "Boss",
  supervisorPhone: "2065550101",
  jobTitle: "Engineer",
  monthlyIncome: "5000",
  annualIncome: "60000",
  employmentStart: "2020-01-01",
  otherIncome: "",
  bankruptcy: "no",
  criminal: "no",
  consentCredit: true,
  signature: "Co Signer",
  dateSigned: "2026-06-24",
};

describe("POST /api/public/cosigner-submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing application id", async () => {
    const req = jsonRequest("http://localhost/api/public/cosigner-submissions", {
      method: "POST",
      body: { ...baseSubmission, signerAppId: "" },
    });
    const res = await cosignerSubmit(req);
    expect(res.status).toBe(400);
  });

  it("rejects unknown application id", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/public/cosigner-submissions", {
      method: "POST",
      body: baseSubmission,
    });
    const res = await cosignerSubmit(req);
    expect(res.status).toBe(404);
  });

  it("accepts valid co-signer submission", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "manager_application_records") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "AXIS-TEST1234", manager_user_id: "mgr-1", row_data: { name: "Primary" } },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "cosigner_submission_records") {
          return { insert };
        }
        return {};
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/public/cosigner-submissions", {
      method: "POST",
      body: baseSubmission,
    });
    const res = await cosignerSubmit(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean }>(res);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });
});
