import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleClawLeasingInbound } from "@/lib/claw-leasing-bot.server";
import { clawMessengerApiKey, isClawMessengerConfigured } from "@/lib/claw-messenger.server";

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
  // Claw is opt-in legacy — production inbound is /api/twilio/inbound.
  if (!isClawMessengerConfigured()) {
    return NextResponse.json(
      { error: "Claw Messenger is disabled. Use Twilio inbound at /api/twilio/inbound." },
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

  const result = await handleClawLeasingInbound({
    from,
    text,
    messageId: body.messageId ?? null,
    chatId: body.chatId ?? null,
    service: body.service ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Handler failed.", intent: result.intent }, { status: 502 });
  }
  return NextResponse.json({ ok: true, intent: result.intent, replied: result.replied });
}
