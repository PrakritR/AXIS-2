import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/resident-register/route";

/**
 * Prospective-resident self-serve signup is now ENABLED (captain decision): a
 * renter creates a resident account, then applies from inside their portal. This
 * guards the input validation that runs BEFORE any account is minted — a bad
 * email, missing phone, or weak password must be rejected up front (400) so the
 * handler never reaches the service-role create path with junk input.
 */
function req(body: unknown): Request {
  return new Request("http://localhost/api/auth/resident-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/resident-register (input validation)", () => {
  it("rejects an invalid email", async () => {
    const res = await POST(req({ email: "not-an-email", phone: "2065550100", password: "abcdefgh" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/valid email/i);
  });

  it("rejects a missing phone", async () => {
    const res = await POST(req({ email: "new@example.com", phone: "", password: "abcdefgh" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/phone/i);
  });

  it("rejects a too-short password", async () => {
    const res = await POST(req({ email: "new@example.com", phone: "2065550100", password: "short" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/8 characters/i);
  });
});
