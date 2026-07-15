/**
 * Linq (linqapp.com) — iMessage/SMS partner API used as the resident texting
 * channel for allowlisted manager accounts. Residents see ONE number (the Linq
 * line) for tours, lease signing, and property messaging; replies come back via
 * the Standard-Webhooks-signed webhook at /api/webhooks/linq.
 *
 * Env:
 * - LINQ_API_TOKEN        bearer token (sandbox or production)
 * - LINQ_FROM_NUMBER      the Linq line in E.164 (e.g. +12055030850)
 * - LINQ_MANAGER_EMAILS   comma-separated manager emails the channel is live
 *                         for (empty = enabled for every manager)
 * - LINQ_WEBHOOK_SECRET   whsec_… signing secret returned when the webhook
 *                         subscription was created (shown once by Linq)
 *
 * Everything no-ops gracefully when unset — same convention as Twilio.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const LINQ_API_BASE = "https://api.linqapp.com/api/partner/v3";

export type LinqConfig = {
  token: string;
  fromNumber: string;
};

export function linqConfig(): LinqConfig | null {
  const token = process.env.LINQ_API_TOKEN?.trim();
  const fromNumber = process.env.LINQ_FROM_NUMBER?.trim();
  if (!token || !fromNumber) return null;
  return { token, fromNumber };
}

/**
 * Whether the Linq channel is live for this manager. An unset allowlist means
 * every manager; a set allowlist (e.g. "testeverything@test.axis.local,
 * ogambik2@gmail.com") restricts the channel to those accounts. An unknown
 * manager (no email available at the call site) is treated as NOT enabled so
 * the rollout stays scoped.
 */
export function isLinqEnabledForManager(managerEmail: string | null | undefined): boolean {
  if (!linqConfig()) return false;
  const allow = (process.env.LINQ_MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const email = String(managerEmail ?? "").trim().toLowerCase();
  return Boolean(email) && allow.includes(email);
}

export type LinqSendResult = { sent: boolean; chatId?: string; error?: string };

/** Send a text from the Linq line. `to` must be E.164. */
export async function sendLinqText(to: string, text: string): Promise<LinqSendResult> {
  const config = linqConfig();
  if (!config) return { sent: false, error: "linq_not_configured" };
  const body = {
    from: config.fromNumber,
    to: [to],
    message: { parts: [{ type: "text", value: text }] },
  };
  try {
    const res = await fetch(`${LINQ_API_BASE}/chats`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      chat?: { id?: string };
      chat_id?: string;
      id?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return { sent: false, error: payload.error ?? payload.message ?? `linq_http_${res.status}` };
    }
    return { sent: true, chatId: payload.chat?.id ?? payload.chat_id ?? payload.id };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "linq_send_failed" };
  }
}

/**
 * Standard Webhooks verification (https://www.standardwebhooks.com/):
 * signed content is `{webhook-id}.{webhook-timestamp}.{rawBody}`, HMAC-SHA256
 * with the base64-decoded secret (whsec_ prefix stripped), compared in
 * constant time against the `v1,<base64>` entries of `webhook-signature`.
 * Timestamps older than 5 minutes are rejected (replay protection).
 */
export function verifyLinqWebhook(args: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): boolean {
  const secretRaw = process.env.LINQ_WEBHOOK_SECRET?.trim();
  if (!secretRaw || !args.id || !args.timestamp || !args.signature) return false;

  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const secret = Buffer.from(secretRaw.replace(/^whsec_/, ""), "base64");
  const signedContent = `${args.id}.${args.timestamp}.${args.rawBody}`;
  const expected = createHmac("sha256", secret).update(signedContent).digest();

  for (const entry of args.signature.split(/\s+/)) {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) continue;
    try {
      const candidate = Buffer.from(sig, "base64");
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
    } catch {
      /* malformed entry — try the next one */
    }
  }
  return false;
}
