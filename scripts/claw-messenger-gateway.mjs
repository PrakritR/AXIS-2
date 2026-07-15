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
  if (messageId) {
    if (seen.has(messageId)) return;
    seen.add(messageId);
    if (seen.size > 2000) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
  }

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
      sinceIso = new Date().toISOString();
      void forward(frame).catch((err) => console.error("[claw-gateway] forward error", err));
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
