import { describe, expect, it } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";
import { POST as residentRegister } from "@/app/api/auth/resident-register/route";
import { POST as registerResident } from "@/app/api/auth/register-resident/route";
import { POST as residentSetup } from "@/app/api/auth/resident-setup/route";

describe("resident account creation gates", () => {
  it("rejects generic POST /api/auth/resident-register", async () => {
    const res = await residentRegister();
    expect(res.status).toBe(403);
    const { data } = await parseJsonResponse<{ error?: string }>(res);
    expect(String(data.error ?? "").toLowerCase()).toContain("setup link");
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
