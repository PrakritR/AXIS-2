import { describe, expect, it } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";
import { POST as residentRegister } from "@/app/api/auth/resident-register/route";
import { POST as registerResident } from "@/app/api/auth/register-resident/route";
import { POST as residentSetup } from "@/app/api/auth/resident-setup/route";

describe("resident account creation gates", () => {
  // Prospective-resident self-serve signup is now enabled (captain decision):
  // a renter creates an account, then applies from inside their portal. The
  // endpoint still validates input before minting anything — a weak password is
  // rejected up front, never reaching the create path.
  it("validates POST /api/auth/resident-register input (weak password)", async () => {
    const req = jsonRequest("http://localhost/api/auth/resident-register", {
      method: "POST",
      body: { email: "new@example.com", phone: "2065550100", password: "short" },
    });
    const res = await residentRegister(req);
    expect(res.status).toBe(400);
    const { data } = await parseJsonResponse<{ error?: string }>(res);
    expect(String(data.error ?? "").toLowerCase()).toContain("8 characters");
  });

  it("rejects legacy POST /api/auth/register-resident", async () => {
    const res = await registerResident();
    expect(res.status).toBe(403);
    const { data } = await parseJsonResponse<{ error?: string }>(res);
    expect(String(data.error ?? "").toLowerCase()).toContain("setup link");
  });

  it("rejects POST /api/auth/resident-setup without a token", async () => {
    const req = jsonRequest("http://localhost/api/auth/resident-setup", {
      method: "POST",
      body: {
        email: "a@b.com",
        password: "password123",
        axisId: "AXIS-1",
      },
    });
    const res = await residentSetup(req);
    expect(res.status).toBe(403);
    const { data } = await parseJsonResponse<{ error?: string }>(res);
    expect(String(data.error ?? "").toLowerCase()).toContain("setup link");
  });
});
