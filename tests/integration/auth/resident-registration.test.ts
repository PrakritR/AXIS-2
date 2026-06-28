import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/find-auth-user-id-by-email", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

vi.mock("@/lib/auth/profile-primary-role", () => ({
  primaryRoleWhenAddingResident: vi.fn((role?: string) => role ?? "resident"),
}));

vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/manager-applications-storage", () => ({
  normalizeApplicationAxisId: vi.fn((id: string) => id),
}));

vi.mock("@/lib/manager-id", () => ({
  generateAxisId: vi.fn(() => "AXIS-GENERATED"),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { POST as registerResident } from "@/app/api/auth/register-resident/route";

const VALID_AXIS_ID = "AXIS-TEST001";

function makeDbMock(options: {
  applicationRows?: Array<{ id: string; resident_email: string; row_data: unknown }>;
  createUserSuccess?: boolean;
}) {
  const { applicationRows = [], createUserSuccess = true } = options;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "manager_application_records") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: applicationRows, error: null }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), upsert: vi.fn().mockResolvedValue({ error: null }) };
    }),
    auth: {
      admin: {
        createUser: createUserSuccess
          ? vi.fn().mockResolvedValue({ data: { user: { id: "new_res_id" } }, error: null })
          : vi.fn().mockResolvedValue({ data: null, error: { message: "User already registered" } }),
        getUserById: vi.fn().mockResolvedValue({ data: { user: { user_metadata: { role: "resident" } } } }),
        updateUserById: vi.fn().mockResolvedValue({ data: { user: { id: "existing_res_id" } }, error: null }),
      },
    },
  };
}

const validApplication = {
  id: VALID_AXIS_ID,
  resident_email: "resident@example.com",
  row_data: { bucket: "approved", name: "Test Resident" },
};

describe("POST /api/auth/register-resident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const db = makeDbMock({});
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { password: "TestPass123!", axisId: VALID_AXIS_ID },
    });
    const res = await registerResident(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when axisId is missing", async () => {
    const db = makeDbMock({});
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "resident@example.com", password: "TestPass123!" },
    });
    const res = await registerResident(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const db = makeDbMock({});
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "resident@example.com", password: "short", axisId: VALID_AXIS_ID },
    });
    const res = await registerResident(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when axisId is not found", async () => {
    const db = makeDbMock({ applicationRows: [] });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "resident@example.com", password: "TestPass123!", axisId: "AXIS-UNKNOWN" },
    });
    const res = await registerResident(req);
    expect(res.status).toBe(403);
  });

  it("creates resident account with valid axisId and email", async () => {
    const db = makeDbMock({ applicationRows: [validApplication] });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "resident@example.com", password: "TestPass123!", axisId: VALID_AXIS_ID },
    });
    const res = await registerResident(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; axisId?: string; reusedExistingAuthUser?: boolean }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reusedExistingAuthUser).toBe(false);
  });

  it("reuses existing auth user when email already registered", async () => {
    const db = makeDbMock({ applicationRows: [validApplication], createUserSuccess: false });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);
    vi.mocked(findAuthUserIdByEmail).mockResolvedValue("existing_res_id");

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "resident@example.com", password: "TestPass123!", axisId: VALID_AXIS_ID },
    });
    const res = await registerResident(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; reusedExistingAuthUser?: boolean }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reusedExistingAuthUser).toBe(true);
  });

  it("returns 403 when axisId belongs to a different email", async () => {
    const db = makeDbMock({
      applicationRows: [{ ...validApplication, resident_email: "other@example.com" }],
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/register-resident", {
      method: "POST",
      body: { email: "wrong@example.com", password: "TestPass123!", axisId: VALID_AXIS_ID },
    });
    const res = await registerResident(req);
    expect(res.status).toBe(403);
  });
});
