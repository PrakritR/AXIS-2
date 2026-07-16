#!/usr/bin/env node
/**
 * Persistent Claw Messenger WebSocket gateway.
 *
 * Keeps a connection open so inbound iMessage/SMS replies are not dropped
 * ("Reply missed your agent"), and forwards each message to the Axis webhook.
 *
 * Usage (local):
 *   node --env-file=.env.local scripts/claw-messenger-gateway.mjs
 *
 * Usage (prod worker / always-on host):
 *   CLAW_MESSENGER_API_KEY=... AXIS_WEBHOOK_URL=https://www.axis-seattle-housing.com/api/webhooks/claw-messenger \
 *     node scripts/claw-messenger-gateway.mjs
 */

import WebSocket from "ws";

const apiKey = process.env.CLAW_MESSENGER_API_KEY?.trim();
const wsBase = process.env.CLAW_MESSENGER_WS_URL?.trim() || "wss://claw-messenger.onrender.com/ws";
const webhookUrl =
  process.env.AXIS_CLAW_WEBHOOK_URL?.trim() ||
  process.env.AXIS_WEBHOOK_URL?.trim() ||
  `${(process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/webhooks/claw-messenger`;
const webhookSecret = process.env.CLAW_MESSENGER_WEBHOOK_SECRET?.trim() || "";

if (!apiKey) {
  console.error("CLAW_MESSENGER_API_KEY is required.");
  process.exit(1);
}

let backoffMs = 1000;
let sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const seen = new Set();

async function forward(frame) {
  const messageId = typeof frame.messageId === "string" ? frame.messageId : "";
  if (messageId && seen.has(messageId)) return true;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (webhookSecret) {
    const { createHmac } = await import("node:crypto");
    headers["x-claw-signature"] = createHmac("sha256", webhookSecret)
      .update(JSON.stringify(frame))
      .digest("hex");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(frame),
  });
  const bodyText = await res.text();
  console.log(`[claw-gateway] forward ${res.status} from=${frame.from || "?"} replay=${Boolean(frame.replay)} ${bodyText.slice(0, 180)}`);
  if (!res.ok) return false;

  // Mark seen only once the webhook accepted it, so a failed POST can retry.
  if (messageId) {
    seen.add(messageId);
    if (seen.size > 2000) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
  }
  return true;
}

async function deliverWithRetry(frame) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (await forward(frame)) {
        // Advance the reconnect-sync cursor only after a successful delivery —
        // a webhook outage must not permanently drop the inbound text.
        sinceIso = new Date().toISOString();
        return;
      }
    } catch (err) {
      console.error("[claw-gateway] forward error", err);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2000 * 2 ** attempt)));
  }
  console.error(
    `[claw-gateway] giving up on message ${frame.messageId || "?"} — reconnect sync will replay it`,
  );
}

function connect() {
  const url = `${wsBase}?key=${encodeURIComponent(apiKey)}`;
  console.log(`[claw-gateway] connecting → webhook ${webhookUrl}`);
  const ws = new WebSocket(url);

  const pingTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 25_000);

  ws.on("open", () => {
    backoffMs = 1000;
    console.log("[claw-gateway] connected");
    ws.send(JSON.stringify({ type: "sync", since: sinceIso }));
  });

  ws.on("message", (data) => {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }
    if (frame.type === "pong") return;
    if (frame.type === "sync.done") {
      console.log(`[claw-gateway] sync.done count=${frame.count ?? 0}`);
      return;
    }
    if (frame.type === "message") {
      void deliverWithRetry(frame);
    }
  });

  ws.on("close", () => {
    clearInterval(pingTimer);
    console.warn(`[claw-gateway] closed — retry in ${backoffMs}ms`);
    setTimeout(connect, backoffMs);
    backoffMs = Math.min(30_000, backoffMs * 2);
  });

  ws.on("error", (err) => {
    console.error("[claw-gateway] socket error", err.message || err);
  });
}

connect();
