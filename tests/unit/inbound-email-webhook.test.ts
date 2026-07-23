import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyResendWebhookSignature } from "@/lib/inbound-email/verify-signature";
import {
  buildInboundEmailInboxRow,
  ingestInboundEmail,
  inboundEmailThreadId,
  parseEmailAddress,
  parseInboundEmailWebhook,
  htmlToText,
  type ParsedInboundEmail,
} from "@/lib/inbound-email/inbound-email.server";
import { ADMIN_INBOX_SCOPE } from "@/lib/portal-inbox-thread-scope";

// whsec_ + base64 body — the shape Resend/Svix issues.
const SECRET = `whsec_${Buffer.from("inbound-email-test-signing-key").toString("base64")}`;

function svixSign(rawBody: string, secret: string, id: string, timestamp: number): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64");
  return `v1,${sig}`;
}

const RECEIVED_PAYLOAD = {
  type: "email.received",
  created_at: "2026-07-23T10:00:00.000Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    created_at: "2026-07-23T10:00:00.000Z",
    from: "Jane Prospect <jane@example.com>",
    to: ["support@prop-lane.space"],
    subject: "Question about a listing",
    text: "Hi, is the downtown unit still available?",
  },
};

describe("verifyResendWebhookSignature", () => {
  const now = 1_770_000_000; // fixed seconds

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_1";
    expect(
      verifyResendWebhookSignature({
        rawBody: body,
        headers: { id, timestamp: String(now), signature: svixSign(body, SECRET, id, now) },
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("accepts when one of several signature entries matches", () => {
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_1";
    const good = svixSign(body, SECRET, id, now);
    const header = `v1,AAAAdeadbeef ${good}`;
    expect(
      verifyResendWebhookSignature({
        rawBody: body,
        headers: { id, timestamp: String(now), signature: header },
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const id = "msg_1";
    const signature = svixSign("{}", SECRET, id, now);
    expect(
      verifyResendWebhookSignature({
        rawBody: JSON.stringify(RECEIVED_PAYLOAD),
        headers: { id, timestamp: String(now), signature },
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_1";
    const signature = svixSign(body, `whsec_${Buffer.from("other").toString("base64")}`, id, now);
    expect(
      verifyResendWebhookSignature({
        rawBody: body,
        headers: { id, timestamp: String(now), signature },
        secret: SECRET,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("rejects a stale timestamp (replay guard)", () => {
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_1";
    const signature = svixSign(body, SECRET, id, now);
    expect(
      verifyResendWebhookSignature({
        rawBody: body,
        headers: { id, timestamp: String(now), signature },
        secret: SECRET,
        nowSeconds: now + 3600,
      }),
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifyResendWebhookSignature({
        rawBody: "{}",
        headers: { id: null, timestamp: null, signature: null },
        secret: SECRET,
      }),
    ).toBe(false);
  });
});

describe("parseInboundEmailWebhook", () => {
  it("parses a valid email.received event", () => {
    const parsed = parseInboundEmailWebhook(RECEIVED_PAYLOAD);
    expect(parsed).toMatchObject({
      emailId: "56761188-7520-42d8-8898-ff6fc54ce618",
      fromEmail: "jane@example.com",
      fromName: "Jane Prospect",
      toEmails: ["support@prop-lane.space"],
      subject: "Question about a listing",
    });
  });

  it("returns null for non-received event types", () => {
    expect(parseInboundEmailWebhook({ type: "email.delivered", data: {} })).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseInboundEmailWebhook({ type: "email.received", data: { subject: "x" } })).toBeNull();
    expect(parseInboundEmailWebhook("nonsense")).toBeNull();
    expect(parseInboundEmailWebhook(null)).toBeNull();
  });

  it("parseEmailAddress handles bare and angled forms", () => {
    expect(parseEmailAddress("Acme <hi@acme.com>")).toEqual({ name: "Acme", email: "hi@acme.com" });
    expect(parseEmailAddress("HI@ACME.COM")).toEqual({ name: "", email: "hi@acme.com" });
  });

  it("htmlToText strips markup but keeps line breaks", () => {
    expect(htmlToText("<p>Hello</p><p>World</p><script>bad()</script>")).toBe("Hello\nWorld");
  });
});

describe("buildInboundEmailInboxRow", () => {
  it("builds an admin-scoped row keyed off the provider id", () => {
    const parsed = parseInboundEmailWebhook(RECEIVED_PAYLOAD)!;
    const row = buildInboundEmailInboxRow({ parsed, bodyText: "hello" });
    expect(row.id).toBe(inboundEmailThreadId(parsed.emailId));
    expect(row.scope).toBe(ADMIN_INBOX_SCOPE); // pins to "admin" — catches drift
    expect(row.participantEmail).toBe("jane@example.com");
    expect(row.folder).toBe("inbox");
    expect(row.senderRole).toBe("partner");
    expect(row.read).toBe(false);
  });
});

/** Minimal fake of the Supabase query builder used by ingestInboundEmail. */
function fakeDb(opts: { existing: boolean }) {
  const upserts: Array<{ record: Record<string, unknown> }> = [];
  const db = {
    upserts,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: opts.existing ? { id: "x" } : null }),
              };
            },
          };
        },
        upsert: async (record: Record<string, unknown>) => {
          upserts.push({ record });
          return { error: null };
        },
      };
    },
  };
  return db;
}

const PARSED: ParsedInboundEmail = {
  emailId: "abc-123",
  fromEmail: "jane@example.com",
  fromName: "Jane Prospect",
  toEmails: ["support@prop-lane.space"],
  subject: "Hello",
  receivedAt: "2026-07-23T10:00:00.000Z",
  text: "inline body so no network fetch is attempted",
};

describe("ingestInboundEmail", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("creates an admin-scope, owner-agnostic inbox thread for a new email", async () => {
    const db = fakeDb({ existing: false });
    const result = await ingestInboundEmail(PARSED, db as never);
    expect(result.created).toBe(true);
    expect(db.upserts).toHaveLength(1);
    const record = db.upserts[0]!.record;
    expect(record.id).toBe(inboundEmailThreadId("abc-123"));
    expect(record.scope).toBe(ADMIN_INBOX_SCOPE);
    expect(record.owner_user_id).toBeNull(); // admin scope is owner-agnostic
    expect(record.participant_email).toBe("jane@example.com");
  });

  it("is idempotent — a re-delivered email does not upsert again", async () => {
    const db = fakeDb({ existing: true });
    const result = await ingestInboundEmail(PARSED, db as never);
    expect(result.created).toBe(false);
    expect(db.upserts).toHaveLength(0);
  });
});

describe("POST /api/webhooks/email/inbound", () => {
  const ENV = ["VERCEL", "RESEND_INBOUND_WEBHOOK_SECRET"] as const;
  const ingestSpy = vi.fn(async () => ({ created: true }));

  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.resetModules();
    ingestSpy.mockClear();
    vi.doMock("@/lib/inbound-email/inbound-email.server", async () => {
      const actual = await vi.importActual<typeof import("@/lib/inbound-email/inbound-email.server")>(
        "@/lib/inbound-email/inbound-email.server",
      );
      return { ...actual, ingestInboundEmail: ingestSpy };
    });
  });
  afterEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.restoreAllMocks();
  });

  async function post(body: string, headers: Record<string, string>) {
    const { POST } = await import("@/app/api/webhooks/email/inbound/route");
    return POST(new Request("https://www.prop-lane.space/api/webhooks/email/inbound", { method: "POST", body, headers }));
  }

  it("rejects unsigned requests on Vercel (fail closed)", async () => {
    process.env.VERCEL = "1";
    const res = await post(JSON.stringify(RECEIVED_PAYLOAD), { "Content-Type": "application/json" });
    expect(res.status).toBe(403);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("rejects a bad signature on Vercel", async () => {
    process.env.VERCEL = "1";
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    const res = await post(JSON.stringify(RECEIVED_PAYLOAD), {
      "Content-Type": "application/json",
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,not-a-real-signature",
    });
    expect(res.status).toBe(403);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed inbound email and schedules ingest", async () => {
    process.env.VERCEL = "1";
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_1";
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(body, {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": svixSign(body, SECRET, id, ts),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // after() runs the task synchronously (or via void fallback) in this env.
    await new Promise((r) => setTimeout(r, 0));
    expect(ingestSpy).toHaveBeenCalledOnce();
    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ emailId: RECEIVED_PAYLOAD.data.email_id });
  });

  it("acks non-received events without ingesting", async () => {
    process.env.VERCEL = "1";
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    const body = JSON.stringify({ type: "email.delivered", data: {} });
    const id = "msg_2";
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(body, {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": svixSign(body, SECRET, id, ts),
    });
    expect(res.status).toBe(200);
    expect(ingestSpy).not.toHaveBeenCalled();
  });
});
