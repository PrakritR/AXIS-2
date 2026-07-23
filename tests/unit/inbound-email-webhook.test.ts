import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyResendWebhookSignature } from "@/lib/inbound-email/verify-signature";
import {
  backfillInboundEmailBody,
  buildInboundEmailInboxRow,
  ingestInboundEmail,
  inboundEmailThreadId,
  parseEmailAddress,
  parseInboundEmailWebhook,
  htmlToText,
  INBOUND_EMAIL_BODY_PLACEHOLDER,
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

  it("htmlToText decodes each entity exactly once", () => {
    // &amp;lt; is a literally escaped "&lt;" — decoding &amp; first would
    // double-decode it into "<" and corrupt quoted markup.
    expect(htmlToText("<p>&amp;lt;div&amp;gt; &amp; &lt;b&gt;</p>")).toBe("&lt;div&gt; & <b>");
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

type StoredRow = Record<string, unknown>;

/**
 * Fake of the Supabase query builder used by ingest + backfill. Backs a real row
 * map so the unique-violation and "only overwrite the placeholder" paths are
 * exercised rather than stubbed.
 */
function fakeDb(opts: { insertError?: { code?: string; message: string } } = {}) {
  const rows = new Map<string, StoredRow>();
  const inserts: Array<{ record: StoredRow }> = [];
  const updates: Array<{ patch: StoredRow; filters: Array<[string, unknown]> }> = [];

  function table() {
    return {
      insert: async (record: StoredRow) => {
        inserts.push({ record });
        if (opts.insertError) return { error: opts.insertError };
        const id = String(record.id);
        if (rows.has(id)) return { error: { code: "23505", message: "duplicate key value" } };
        rows.set(id, record);
        return { error: null };
      },
      select() {
        let id = "";
        const chain = {
          eq(column: string, value: unknown) {
            if (column === "id") id = String(value);
            return chain;
          },
          maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }),
        };
        return chain;
      },
      update(patch: StoredRow) {
        const filters: Array<[string, unknown]> = [];
        const run = async () => {
          updates.push({ patch, filters });
          const id = String(filters.find(([column]) => column === "id")?.[1] ?? "");
          const existing = rows.get(id);
          if (!existing) return { error: null };
          const guard = filters.find(([column]) => column === "row_data->>body");
          const storedBody = (existing.row_data as StoredRow | undefined)?.body;
          if (guard && storedBody !== guard[1]) return { error: null };
          rows.set(id, { ...existing, ...patch });
          return { error: null };
        };
        const chain = {
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return chain;
          },
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            run().then(resolve, reject),
        };
        return chain;
      },
    };
  }

  return { rows, inserts, updates, from: table };
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

/** Metadata-only delivery — the shape Resend actually sends. */
const PARSED_NO_BODY: ParsedInboundEmail = { ...PARSED, text: undefined, html: undefined };

function storedRowData(db: ReturnType<typeof fakeDb>, emailId: string): StoredRow {
  return (db.rows.get(inboundEmailThreadId(emailId))!.row_data as StoredRow) ?? {};
}

describe("ingestInboundEmail", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("creates an admin-scope, owner-agnostic inbox thread for a new email", async () => {
    const db = fakeDb();
    const result = await ingestInboundEmail(PARSED, db as never);
    expect(result.created).toBe(true);
    expect(db.inserts).toHaveLength(1);
    const record = db.inserts[0]!.record;
    expect(record.id).toBe(inboundEmailThreadId("abc-123"));
    expect(record.scope).toBe(ADMIN_INBOX_SCOPE);
    expect(record.owner_user_id).toBeNull(); // admin scope is owner-agnostic
    expect(record.participant_email).toBe("jane@example.com");
  });

  it("writes the row from metadata alone, never waiting on the body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const db = fakeDb();
    const result = await ingestInboundEmail(PARSED_NO_BODY, db as never);
    expect(result.created).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storedRowData(db, "abc-123").body).toBe(INBOUND_EMAIL_BODY_PLACEHOLDER);
    expect(storedRowData(db, "abc-123").topic).toBe("Hello");
  });

  it("is idempotent — a unique violation from re-delivery is a no-op, not a throw", async () => {
    const db = fakeDb();
    expect((await ingestInboundEmail(PARSED, db as never)).created).toBe(true);
    expect((await ingestInboundEmail(PARSED, db as never)).created).toBe(false);
    expect(db.rows.size).toBe(1);
  });

  it("throws on any other database error so the route can 5xx and force a retry", async () => {
    const db = fakeDb({ insertError: { code: "08006", message: "connection failure" } });
    await expect(ingestInboundEmail(PARSED, db as never)).rejects.toThrow("connection failure");
  });

  it("does not treat a non-23505 error as already-ingested even if it mentions duplicates", async () => {
    const db = fakeDb({ insertError: { code: "42501", message: "row already exists in another schema" } });
    await expect(ingestInboundEmail(PARSED, db as never)).rejects.toThrow("row already exists");
  });
});

describe("backfillInboundEmailBody", () => {
  const ENV_KEY = "RESEND_API_KEY";
  let previousKey: string | undefined;

  function mockBodyFetch(body: string | null) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      body === null
        ? new Response("nope", { status: 502 })
        : Response.json({ data: { text: body } }),
    );
  }

  beforeEach(() => {
    previousKey = process.env[ENV_KEY];
    process.env[ENV_KEY] = "re_test_key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (previousKey === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previousKey;
    vi.restoreAllMocks();
  });

  it("backfills the real body over the placeholder", async () => {
    const db = fakeDb();
    await ingestInboundEmail(PARSED_NO_BODY, db as never);
    mockBodyFetch("The actual support question");

    const result = await backfillInboundEmailBody(PARSED_NO_BODY, db as never);
    expect(result.updated).toBe(true);
    expect(storedRowData(db, "abc-123").body).toBe("The actual support question");
  });

  it("leaves the placeholder in place when the fetch fails, so a redelivery can backfill it", async () => {
    const db = fakeDb();
    await ingestInboundEmail(PARSED_NO_BODY, db as never);

    mockBodyFetch(null);
    expect((await backfillInboundEmailBody(PARSED_NO_BODY, db as never)).updated).toBe(false);
    expect(storedRowData(db, "abc-123").body).toBe(INBOUND_EMAIL_BODY_PLACEHOLDER);

    // Redelivery: the insert no-ops, but the enrichment still lands the body.
    expect((await ingestInboundEmail(PARSED_NO_BODY, db as never)).created).toBe(false);
    mockBodyFetch("Arrived on the retry");
    expect((await backfillInboundEmailBody(PARSED_NO_BODY, db as never)).updated).toBe(true);
    expect(storedRowData(db, "abc-123").body).toBe("Arrived on the retry");
  });

  it("never clobbers a body that already landed, nor the admin's read/thread state", async () => {
    const db = fakeDb();
    await ingestInboundEmail(PARSED_NO_BODY, db as never);
    mockBodyFetch("first body");
    await backfillInboundEmailBody(PARSED_NO_BODY, db as never);

    // The admin reads and replies in-app.
    const id = inboundEmailThreadId("abc-123");
    const stored = db.rows.get(id)!;
    db.rows.set(id, {
      ...stored,
      row_data: { ...(stored.row_data as StoredRow), read: true, thread: [{ from: "admin", body: "on it" }] },
    });

    mockBodyFetch("a later, different body");
    expect((await backfillInboundEmailBody(PARSED_NO_BODY, db as never)).updated).toBe(false);
    const rowData = storedRowData(db, "abc-123");
    expect(rowData.body).toBe("first body");
    expect(rowData.read).toBe(true);
    expect(rowData.thread).toHaveLength(1);
  });

  it("skips the fetch entirely when the webhook already carried the body", async () => {
    const db = fakeDb();
    await ingestInboundEmail(PARSED, db as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await backfillInboundEmailBody(PARSED, db as never)).updated).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/email/inbound", () => {
  const ENV = ["VERCEL", "RESEND_INBOUND_WEBHOOK_SECRET"] as const;
  const ingestSpy = vi.fn(async () => ({ created: true }));
  const backfillSpy = vi.fn(async () => ({ updated: true }));

  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.resetModules();
    ingestSpy.mockClear();
    backfillSpy.mockClear();
    vi.doMock("@/lib/inbound-email/inbound-email.server", async () => {
      const actual = await vi.importActual<typeof import("@/lib/inbound-email/inbound-email.server")>(
        "@/lib/inbound-email/inbound-email.server",
      );
      return { ...actual, ingestInboundEmail: ingestSpy, backfillInboundEmailBody: backfillSpy };
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

  it("accepts a correctly signed inbound email and ingests it inline", async () => {
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
    expect(ingestSpy).toHaveBeenCalledOnce();
    expect(ingestSpy.mock.calls[0]![0]).toMatchObject({ emailId: RECEIVED_PAYLOAD.data.email_id });
    expect(backfillSpy).toHaveBeenCalledOnce();
  });

  it("sheds a flood that rotates its From via the coarse instance cap", async () => {
    process.env.VERCEL = "1";
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ts = Math.floor(Date.now() / 1000);

    const send = async (n: number) => {
      const body = JSON.stringify({
        ...RECEIVED_PAYLOAD,
        data: { ...RECEIVED_PAYLOAD.data, email_id: `flood-${n}`, from: `sender${n}@example.com` },
      });
      const id = `flood_${n}`;
      return post(body, {
        "Content-Type": "application/json",
        "svix-id": id,
        "svix-timestamp": String(ts),
        "svix-signature": svixSign(body, SECRET, id, ts),
      });
    };

    for (let n = 0; n < 300; n += 1) await send(n);
    expect(ingestSpy).toHaveBeenCalledTimes(300); // per-sender bucket never trips

    const shed = await send(300);
    expect(shed.status).toBe(200); // still 200 — a 5xx would make Resend retry the flood
    expect(await shed.json()).toEqual({ ok: true, rateLimited: "instance" });
    expect(ingestSpy).toHaveBeenCalledTimes(300);
  });

  it("returns 500 when the ingest write fails so Resend retries", async () => {
    process.env.VERCEL = "1";
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    ingestSpy.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify(RECEIVED_PAYLOAD);
    const id = "msg_3";
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(body, {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": svixSign(body, SECRET, id, ts),
    });
    expect(res.status).toBe(500);
    expect(backfillSpy).not.toHaveBeenCalled();
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
