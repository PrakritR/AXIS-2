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

function req(email: unknown, ip = freshIp()) {
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

/** Distinct IP per request — the IP bucket persists per module too, so a shared default
 * would silently trip once the suite grew and make assertions fail for the wrong reason. */
let ipSeq = 0;
function freshIp() {
  ipSeq += 1;
  return `203.0.113.${ipSeq % 256}`;
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

  it("mints the link on the canonical email origin, not the requesting host", async () => {
    const previousCanonical = process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = "https://prop-lane.space";

    // The request arrives on localhost here, and in production it can arrive on a
    // *.vercel.app preview or the legacy domain — the emailed link must not follow it.
    await POST(req(freshEmail()));

    const text = String(sent[0].body.text);
    const html = String(sent[0].body.html);
    expect(text).toContain(`https://prop-lane.space/auth/confirm?token_hash=${TOKEN}`);
    expect(html).toContain(`https://prop-lane.space/auth/confirm?token_hash=${TOKEN}`);
    expect(text).not.toContain("localhost:3000");
    expect(html).not.toContain("localhost:3000");

    if (previousCanonical === undefined) delete process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    else process.env.NEXT_PUBLIC_CANONICAL_APP_URL = previousCanonical;
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

  it("reports a misconfigured mailer, which is not a per-address signal", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(req(freshEmail()));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
    process.env.RESEND_API_KEY = "re_test_key";
  });

  it("answers a failed send exactly like an unknown address", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fetchSpy.mockResolvedValue(new Response("nope", { status: 422 }));
    const sendFailed = await POST(req(freshEmail()));

    generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const unknown = await POST(req(freshEmail()));

    // Send failure only ever happens for an address that EXISTS, so any difference
    // between these two replies is an account-existence oracle.
    expect(sendFailed.status).toBe(unknown.status);
    expect(sendFailed.status).toBe(200);
    const sendFailedBody = await sendFailed.json();
    expect(sendFailedBody).toEqual({ ok: true });
    expect(sendFailedBody).toEqual(await unknown.json());

    errorSpy.mockRestore();
  });

  it("answers the generic reply when the recovery token cannot be minted at all", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateLink.mockRejectedValue(new Error("SUPABASE_SERVICE_ROLE_KEY is not set"));

    const res = await POST(req(freshEmail()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    errorSpy.mockRestore();
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
