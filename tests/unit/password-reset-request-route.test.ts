/**
 * `POST /api/auth/password-reset` — the server-minted recovery email.
 *
 * The client used to call `supabase.auth.resetPasswordForEmail`, which starts a PKCE
 * flow and mails a `/auth/callback?code=…` link that ONLY the requesting browser can
 * exchange. Opening it from Gmail on another device failed with "PKCE code verifier
 * not found in storage" and dumped the user on the sign-in page. This route mints the
 * recovery token server-side and mails a `token_hash` link instead, which `verifyOtp`
 * accepts from any browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({ auth: { admin: { generateLink } } }),
}));

import { POST } from "@/app/api/auth/password-reset/route";

const TOKEN = "pkce-free-recovery-token-hash";

function req(email: unknown, ip = "203.0.113.9") {
  return new Request("http://localhost:3000/api/auth/password-reset", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email }),
  });
}

/** Distinct address per test — the rate limiter buckets by email and persists per module. */
let seq = 0;
function freshEmail() {
  seq += 1;
  return `reset-user-${seq}@example.com`;
}

let sent: { body: Record<string, unknown> }[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sent = [];
  generateLink.mockReset();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: TOKEN } }, error: null });
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "PropLane <noreply@prop-lane.space>";
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    sent.push({ body: JSON.parse(String((init as RequestInit).body)) });
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("POST /api/auth/password-reset", () => {
  it("mails a token_hash confirm link that works in any browser", async () => {
    const email = freshEmail();
    const res = await POST(req(email));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email });

    expect(sent).toHaveLength(1);
    const body = sent[0].body;
    expect(body.to).toEqual([email]);
    const text = String(body.text);
    const html = String(body.html);
    expect(text).toContain(`/auth/confirm?token_hash=${TOKEN}&type=recovery`);
    // HTML entity-escapes the `&` in the href.
    expect(html).toContain(`/auth/confirm?token_hash=${TOKEN}&amp;type=recovery`);
    // The regression itself: never a PKCE callback link.
    expect(text).not.toContain("/auth/callback");
    expect(html).not.toContain("/auth/callback");
  });

  it("lower-cases and trims the address before minting a token", async () => {
    const email = freshEmail();
    await POST(req(`  ${email.toUpperCase()} `));
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email });
  });

  it("answers unknown addresses exactly like known ones and sends nothing", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const res = await POST(req(freshEmail()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("rejects a missing or malformed email", async () => {
    expect((await POST(req(""))).status).toBe(400);
    expect((await POST(req("not-an-email"))).status).toBe(400);
    expect((await POST(req(42))).status).toBe(400);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("reports a real failure instead of silently claiming success", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(req(freshEmail()));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);

    process.env.RESEND_API_KEY = "re_test_key";
    fetchSpy.mockResolvedValue(new Response("nope", { status: 422 }));
    const failed = await POST(req(freshEmail()));
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toMatch(/could not send/i);
  });

  it("throttles repeat requests for one address without leaking that it throttled", async () => {
    const email = freshEmail();
    // Same address from different IPs, so only the per-email bucket can trip.
    for (let i = 0; i < 3; i += 1) {
      expect((await POST(req(email, `198.51.100.${i}`))).status).toBe(200);
    }
    expect(sent).toHaveLength(3);

    const res = await POST(req(email, "198.51.100.99"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(3);
  });

  it("never writes the recovery token to a log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(req(freshEmail()));
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }));
    await POST(req(freshEmail()));

    const written = [...errorSpy.mock.calls, ...infoSpy.mock.calls, ...logSpy.mock.calls].flat().join(" ");
    expect(written).not.toContain(TOKEN);

    errorSpy.mockRestore();
    infoSpy.mockRestore();
    logSpy.mockRestore();
  });
});
