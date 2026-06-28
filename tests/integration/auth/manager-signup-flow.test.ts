import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/manager-purchase-from-session", () => ({
  recordPaidManagerCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/find-auth-user-id-by-email", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

vi.mock("@/lib/auth/verify-auth-password", () => ({
  assertPasswordMatchesExistingAuthUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/auth/profile-primary-role", () => ({
  primaryRoleWhenAddingManager: vi.fn((role?: string) => role ?? "manager"),
}));

vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: vi.fn().mockResolvedValue(undefined),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { POST as managerSignup } from "@/app/api/auth/manager-signup/route";

const AXIS_INTENT_SESSION = "axis_intent_test123";
const STRIPE_SESSION = "cs_test_stripe_session";

function makeDbMock(options: {
  purchase?: { id: string; email: string; manager_id: string; user_id?: null; full_name?: string } | null;
  createUserSuccess?: boolean;
  existingUserId?: string;
}) {
  const { purchase = null, createUserSuccess = true, existingUserId } = options;
  const createdUserId = "new_user_id";

  const purchaseMaybeSingle = vi.fn().mockResolvedValue({ data: purchase, error: purchase ? null : null });
  const profileMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "manager_purchases") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: purchaseMaybeSingle }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: profileMaybeSingle }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), upsert: vi.fn().mockResolvedValue({ error: null }) };
    }),
    auth: {
      admin: {
        createUser: createUserSuccess
          ? vi.fn().mockResolvedValue({ data: { user: { id: createdUserId } }, error: null })
          : vi.fn().mockResolvedValue({ data: null, error: { message: "User already registered" } }),
      },
    },
  };
  return mockDb;
}

describe("POST /api/auth/manager-signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when sessionId is missing", async () => {
    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { password: "TestPass123!" },
    });
    const res = await managerSignup(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { sessionId: AXIS_INTENT_SESSION, password: "short" },
    });
    const res = await managerSignup(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown axis_intent session", async () => {
    const db = makeDbMock({ purchase: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { sessionId: "axis_intent_unknown", password: "TestPass123!" },
    });
    const res = await managerSignup(req);
    expect(res.status).toBe(400);
  });

  it("creates manager account from valid axis_intent session", async () => {
    const db = makeDbMock({
      purchase: {
        id: "purchase_1",
        email: "mgr@example.com",
        manager_id: "MGR-INTENT-01",
        user_id: null,
        full_name: "Test Manager",
      },
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { sessionId: AXIS_INTENT_SESSION, password: "TestPass123!" },
    });
    const res = await managerSignup(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; managerId?: string }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.managerId).toBe("MGR-INTENT-01");
  });

  it("reuses existing auth user when email already exists in axis_intent flow", async () => {
    const db = makeDbMock({
      purchase: { id: "purchase_2", email: "existing@example.com", manager_id: "MGR-EXIST-01", user_id: null },
      createUserSuccess: false,
      existingUserId: "existing_user_id",
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);
    vi.mocked(findAuthUserIdByEmail).mockResolvedValue("existing_user_id");

    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { sessionId: AXIS_INTENT_SESSION, password: "TestPass123!" },
    });
    const res = await managerSignup(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; managerId?: string }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.managerId).toBe("MGR-EXIST-01");
  });

  it("creates manager account from Stripe checkout session", async () => {
    const stripeMock = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: STRIPE_SESSION,
            payment_status: "paid",
            status: "complete",
            metadata: { manager_id: "MGR-STRIPE-01", email: "stripe@example.com", full_name: "Stripe Manager" },
            customer_details: { email: "stripe@example.com" },
          }),
        },
      },
    };
    vi.mocked(getStripe).mockReturnValue(stripeMock as never);

    const db = makeDbMock({
      purchase: { id: "purchase_3", email: "stripe@example.com", manager_id: "MGR-STRIPE-01", user_id: null },
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue(db as never);

    const req = jsonRequest("http://localhost/api/auth/manager-signup", {
      method: "POST",
      body: { sessionId: STRIPE_SESSION, password: "TestPass123!" },
    });
    const res = await managerSignup(req);
    const { status, data } = await parseJsonResponse<{ ok?: boolean; managerId?: string }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.managerId).toBe("MGR-STRIPE-01");
  });
});
