import { describe, expect, it } from "vitest";
import { parseJsonResponse } from "../../helpers/api-request";
import { POST as registerResident } from "@/app/api/auth/register-resident/route";

describe("POST /api/auth/register-resident", () => {
  it("rejects legacy signup — residents must use the emailed setup link", async () => {
    const res = await registerResident();
    expect(res.status).toBe(403);
    const { data } = await parseJsonResponse<{ error?: string }>(res);
    expect(String(data.error ?? "").toLowerCase()).toContain("setup link");
  });
});
