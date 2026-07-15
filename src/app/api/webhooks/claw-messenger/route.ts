import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleClawLeasingInbound } from "@/lib/claw-leasing-bot.server";
import { clawMessengerApiKey } from "@/lib/claw-messenger.server";

export const runtime = "nodejs";

/**
 * Inbound messages forwarded by `scripts/claw-messenger-gateway.mjs`.
 *
 * Auth: Authorization Bearer CLAW_MESSENGER_API_KEY, or HMAC header
 * `x-claw-signature` = hex(hmac_sha256(rawBody, CLAW_MESSENGER_WEBHOOK_SECRET)).
 */
function authorized(req: Request, rawBody: string): boolean {
  const apiKey = clawMessengerApiKey();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (apiKey && bearer && bearer === apiKey) return true;

  const secret = process.env.CLAW_MESSENGER_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("x-claw-signature")?.trim();
  if (secret && signature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(signature, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

export async function POST(req: Request) {
  if (!clawMessengerApiKey()) {
    return NextResponse.json({ error: "Claw Messenger is not configured." }, { status: 503 });
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
