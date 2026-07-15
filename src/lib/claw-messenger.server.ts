/**
 * Claw Messenger client (iMessage / RCS / SMS via Emotion Machine relay).
 *
 * Outbound: open a short-lived WebSocket, send, wait for send.result, close.
 * Inbound: a persistent gateway (`scripts/claw-messenger-gateway.mjs`) keeps a
 * WebSocket open and POSTs messages to `/api/webhooks/claw-messenger`.
 *
 * Shared agent line (current trial): CLAW_MESSENGER_AGENT_PHONE.
 */

import { randomUUID } from "node:crypto";
import WebSocket from "ws";

export const CLAW_DEFAULT_AGENT_PHONE = "+12053690702";
export const CLAW_DEFAULT_WS_URL = "wss://claw-messenger.onrender.com/ws";
export const CLAW_DEFAULT_HTTP_BASE = "https://claw-messenger.onrender.com";

export function clawMessengerApiKey(): string | null {
  return process.env.CLAW_MESSENGER_API_KEY?.trim() || null;
}

export function clawMessengerWsUrl(): string {
  return process.env.CLAW_MESSENGER_WS_URL?.trim() || CLAW_DEFAULT_WS_URL;
}

export function clawMessengerHttpBase(): string {
  return process.env.CLAW_MESSENGER_HTTP_BASE?.trim() || CLAW_DEFAULT_HTTP_BASE;
}

/** Shared leasing/contact phone shown on listings (Claw agent line). */
export function clawLeasingAgentPhoneE164(): string {
  const raw = process.env.CLAW_MESSENGER_AGENT_PHONE?.trim() || CLAW_DEFAULT_AGENT_PHONE;
  return normalizeE164Us(raw) ?? CLAW_DEFAULT_AGENT_PHONE;
}

export function isClawMessengerConfigured(): boolean {
  return Boolean(clawMessengerApiKey());
}

export function normalizeE164Us(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export type ClawSendResult = {
  ok: boolean;
  status?: string;
  messageId?: string;
  chatId?: string;
  error?: string;
  raw?: unknown;
};

type WsFrame = Record<string, unknown>;

function waitForSendResult(ws: WebSocket, correlationId: string, timeoutMs: number): Promise<ClawSendResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: "Timed out waiting for Claw Messenger send.result." });
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(String(data)) as WsFrame;
      } catch {
        return;
      }
      if (frame.type !== "send.result" || frame.id !== correlationId) return;
      cleanup();
      resolve({
        ok: frame.ok === true,
        status: typeof frame.status === "string" ? frame.status : undefined,
        messageId: typeof frame.messageId === "string" ? frame.messageId : undefined,
        chatId: typeof frame.chatId === "string" ? frame.chatId : undefined,
        error: typeof frame.error === "string" ? frame.error : undefined,
        raw: frame,
      });
    };

    const onError = (err: Error) => {
      cleanup();
      resolve({ ok: false, error: err.message || "WebSocket error." });
    };

    const onClose = () => {
      cleanup();
      resolve({ ok: false, error: "WebSocket closed before send.result." });
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

/**
 * Send one text via Claw Messenger. Opens a temporary WebSocket connection.
 * Preferred service defaults to iMessage with automatic SMS/RCS fallback.
 */
export async function sendClawMessengerText(args: {
  to: string;
  text: string;
  service?: "iMessage" | "SMS" | "RCS";
  timeoutMs?: number;
}): Promise<ClawSendResult> {
  const apiKey = clawMessengerApiKey();
  if (!apiKey) return { ok: false, error: "CLAW_MESSENGER_API_KEY is not set." };

  const to = normalizeE164Us(args.to);
  if (!to) return { ok: false, error: "Recipient phone must be a valid US number." };
  const text = args.text.trim();
  if (!text) return { ok: false, error: "Message text is required." };

  const correlationId = `axis-${randomUUID()}`;
  const url = `${clawMessengerWsUrl()}?key=${encodeURIComponent(apiKey)}`;

  return await new Promise<ClawSendResult>((resolve) => {
    let settled = false;
    const finish = (result: ClawSendResult) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const ws = new WebSocket(url);

    const openTimer = setTimeout(() => {
      finish({ ok: false, error: "Timed out opening Claw Messenger WebSocket." });
    }, args.timeoutMs ?? 12_000);

    ws.on("open", () => {
      clearTimeout(openTimer);
      const payload: Record<string, unknown> = {
        type: "send",
        id: correlationId,
        to,
        parts: [{ type: "text", value: text }],
      };
      if (args.service) payload.service = args.service;
      void waitForSendResult(ws, correlationId, args.timeoutMs ?? 20_000).then(finish);
      ws.send(JSON.stringify(payload));
    });

    ws.on("error", (err) => {
      clearTimeout(openTimer);
      finish({ ok: false, error: err.message || "WebSocket error." });
    });
  });
}

/** Register a human phone so inbound texts from them reach the WebSocket gateway. */
export async function registerClawMessengerRoute(phone: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = clawMessengerApiKey();
  if (!apiKey) return { ok: false, error: "CLAW_MESSENGER_API_KEY is not set." };
  const phoneNumber = normalizeE164Us(phone);
  if (!phoneNumber) return { ok: false, error: "Invalid phone number." };

  try {
    const res = await fetch(`${clawMessengerHttpBase()}/api/routes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
    if (!res.ok) {
      return { ok: false, error: body.detail || body.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}
