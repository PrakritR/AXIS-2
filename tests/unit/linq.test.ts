import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { isLinqEnabledForManager, verifyLinqWebhook } from "@/lib/linq.server";

const ENV_KEYS = ["LINQ_API_TOKEN", "LINQ_FROM_NUMBER", "LINQ_MANAGER_EMAILS", "LINQ_WEBHOOK_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.LINQ_API_TOKEN = "tok_test";
  process.env.LINQ_FROM_NUMBER = "+12055030850";
  process.env.LINQ_MANAGER_EMAILS = "testeverything@test.axis.local,ogambik2@gmail.com";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Linq manager allowlist", () => {
  it("enabled only for allowlisted manager emails (case-insensitive)", () => {
    expect(isLinqEnabledForManager("testeverything@test.axis.local")).toBe(true);
    expect(isLinqEnabledForManager("OGAMBIK2@GMAIL.COM")).toBe(true);
    expect(isLinqEnabledForManager("someone@else.com")).toBe(false);
    expect(isLinqEnabledForManager(null)).toBe(false);
    expect(isLinqEnabledForManager("")).toBe(false);
  });

  it("empty allowlist enables every manager", () => {
    process.env.LINQ_MANAGER_EMAILS = "";
    expect(isLinqEnabledForManager("anyone@example.com")).toBe(true);
  });

  it("disabled entirely without token/number config", () => {
    delete process.env.LINQ_API_TOKEN;
    expect(isLinqEnabledForManager("testeverything@test.axis.local")).toBe(false);
  });
});

describe("Standard Webhooks verification", () => {
  function signedHeaders(rawBody: string, secretB64: string, tsOffsetSec = 0) {
    const id = "msg_test_1";
    const ts = String(Math.floor(Date.now() / 1000) + tsOffsetSec);
    const key = Buffer.from(secretB64, "base64");
    const signature = `v1,${createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64")}`;
    return { id, timestamp: ts, signature };
  }

  const secretB64 = randomBytes(24).toString("base64");

  it("accepts a correctly signed payload (whsec_ prefix stripped)", () => {
    process.env.LINQ_WEBHOOK_SECRET = `whsec_${secretB64}`;
    const rawBody = JSON.stringify({ event_type: "message.received" });
    const h = signedHeaders(rawBody, secretB64);
    expect(verifyLinqWebhook({ ...h, rawBody })).toBe(true);
  });

  it("rejects a tampered body", () => {
    process.env.LINQ_WEBHOOK_SECRET = `whsec_${secretB64}`;
    const rawBody = JSON.stringify({ event_type: "message.received" });
    const h = signedHeaders(rawBody, secretB64);
    expect(verifyLinqWebhook({ ...h, rawBody: rawBody + " " })).toBe(false);
  });

  it("rejects stale timestamps (replay protection, 5 min)", () => {
    process.env.LINQ_WEBHOOK_SECRET = `whsec_${secretB64}`;
    const rawBody = "{}";
    const h = signedHeaders(rawBody, secretB64, -600);
    expect(verifyLinqWebhook({ ...h, rawBody })).toBe(false);
  });

  it("rejects when the secret is unset or headers missing", () => {
    delete process.env.LINQ_WEBHOOK_SECRET;
    const rawBody = "{}";
    const h = signedHeaders(rawBody, secretB64);
    expect(verifyLinqWebhook({ ...h, rawBody })).toBe(false);
    process.env.LINQ_WEBHOOK_SECRET = `whsec_${secretB64}`;
    expect(verifyLinqWebhook({ id: null, timestamp: h.timestamp, signature: h.signature, rawBody })).toBe(false);
  });
});
