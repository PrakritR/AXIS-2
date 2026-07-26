import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleClawLeasingInbound } from "@/lib/claw-leasing-bot.server";
import {
  clawLeasingAgentPhoneE164,
  clawMessengerApiKey,
  isClawMessengerConfigured,
} from "@/lib/claw-messenger.server";

export const runtime = "nodejs";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Inbound messages forwarded by `scripts/claw-messenger-gateway.mjs`.
 *
 * Auth: when CLAW_MESSENGER_WEBHOOK_SECRET is set, the HMAC header
 * `x-claw-signature` = hex(hmac_sha256(rawBody, secret)) is REQUIRED — the
 * relay-shared CLAW_MESSENGER_API_KEY can then no longer forge frames (it also
 * travels in the relay WS URL where upstream logs can capture it). Without the
 * secret, Bearer CLAW_MESSENGER_API_KEY is accepted (trial/dev).
 */
function authorized(req: Request, rawBody: string): boolean {
  const secret = process.env.CLAW_MESSENGER_WEBHOOK_SECRET?.trim();
  if (secret) {
    const signature = req.headers.get("x-claw-signature")?.trim();
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqualStr(expected, signature);
    } catch {
      return false;
    }
  }

  const apiKey = clawMessengerApiKey();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (apiKey && bearer) {
    try {
      return timingSafeEqualStr(bearer, apiKey);
    } catch {
      return false;
    }
  }
  return false;
}

export async function POST(req: Request) {
  // Claw is the production PropLane messaging rail (single shared agent line).
  if (!isClawMessengerConfigured()) {
    return NextResponse.json(
      {
        error:
          "Claw Messenger is not configured. Set CLAW_MESSENGER_ENABLED=1 and CLAW_MESSENGER_API_KEY.",
      },
      { status: 503 },
    );
  }

  const raw = await req.text();
  if (!authorized(req, raw)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    type?: string;
    from?: string;
    text?: string;
    messageId?: string;
    mergedMessageIds?: string[];
    chatId?: string;
    service?: string;
    replay?: boolean;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.type && body.type !== "message") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const from = String(body.from ?? "").trim();
  const text = String(body.text ?? "");
  if (!from) return NextResponse.json({ error: "from is required." }, { status: 400 });

  // Skip WebSocket history replays unless explicitly enabled — avoids double replies on gateway restart.
  if (body.replay === true && process.env.CLAW_MESSENGER_PROCESS_REPLAYS !== "1") {
    return NextResponse.json({ ok: true, skippedReplay: true });
  }

  // Replies MUST come from the shared Claw agent line so they land in the same
  // iMessage/RCS thread the prospect is texting. Without this, sendFromManagerWorkNumber
  // looks up the manager's Twilio work number and the reply appears in a different thread
  // (looks like "no agent reply" on the Claw conversation).
  const result = await handleClawLeasingInbound({
    from,
    text,
    messageId: body.messageId ?? null,
    mergedMessageIds: Array.isArray(body.mergedMessageIds)
      ? body.mergedMessageIds.filter((id): id is string => typeof id === "string")
      : [],
    chatId: body.chatId ?? null,
    service: body.service ?? null,
    workNumber: clawLeasingAgentPhoneE164(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Handler failed.", intent: result.intent }, { status: 502 });
  }
  return NextResponse.json({ ok: true, intent: result.intent, replied: result.replied });
}
