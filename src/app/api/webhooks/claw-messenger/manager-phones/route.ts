import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clawMessengerApiKey, isClawMessengerConfigured } from "@/lib/claw-messenger.server";
import {
  clawManagerDebounceBypassPhones,
  resolveMappedManagerContacts,
} from "@/lib/claw-resident-messaging.server";

export const runtime = "nodejs";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Keyed so a leaked response body alone can't be used to harvest real phone
 * numbers — only to confirm/deny a specific candidate number, which is all
 * the gateway's debounce-bypass check needs. Same key used for auth below, so
 * this adds no new secret. */
function hashPhone(apiKey: string, phoneE164: string): string {
  return createHmac("sha256", apiKey).update(phoneE164.replace(/\D/g, "")).digest("hex");
}

/**
 * Registered shared-line manager phones, for the Claw gateway's reply-debounce
 * bypass: a manager texting the line from their verified personal phone must
 * be relayed immediately, never held in the prospect quiet-window buffer.
 * Bearer-authenticated with the same CLAW_MESSENGER_API_KEY the gateway
 * already holds — no new secret to provision. Returns HMAC digests, not raw
 * phone numbers: CLAW_MESSENGER_API_KEY also travels in the relay WS URL
 * (upstream logs can capture it — see the sibling webhook route's comment),
 * so this endpoint must not turn that into a bulk phone-directory leak for
 * anyone who obtains the key.
 */
export async function GET(req: Request) {
  if (!isClawMessengerConfigured()) {
    return NextResponse.json({ error: "Claw Messenger is not configured." }, { status: 503 });
  }
  const apiKey = clawMessengerApiKey();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey || !bearer || !timingSafeEqualStr(bearer, apiKey)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const managers = await resolveMappedManagerContacts();
  const phoneHashes = [
    ...new Set(
      managers
        .map((m) => m.personalPhone)
        .filter((p): p is string => Boolean(p))
        .concat(clawManagerDebounceBypassPhones())
        .map((p) => hashPhone(apiKey, p)),
    ),
  ];
  return NextResponse.json({ phoneHashes }, { headers: { "Cache-Control": "private, no-store" } });
}
