import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/resident-register/route";

/**
 * Generic self-serve resident signup MUST stay disabled: an email+password POST
 * with no application setup token / OAuth proof would let anyone claim an account
 * under an applicant's email. Residents create accounts only from the emailed
 * setup link (`/auth/resident-setup`) or the in-session handoff after applying.
 * This guard is the regression net for the dead-form rewire.
 */
describe("POST /api/auth/resident-register (disabled)", () => {
  it("always 403s regardless of body", async () => {
    const res = await POST();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; redirectTo?: string };
    expect(body.error).toMatch(/setup link/i);
    expect(body.redirectTo).toBe("/rent/browse");
  });
});
