#!/usr/bin/env node
/**
 * Persistent Claw Messenger WebSocket gateway.
 *
 * Keeps a connection open so inbound iMessage/SMS replies are not dropped
 * ("Reply missed your agent"), and forwards each message to the Axis webhook.
 *
 * Reply pacing: prospect texts are buffered per conversation and forwarded as
 * one consolidated frame after CLAW_MESSENGER_DEBOUNCE_SECONDS (default 150)
 * of quiet from the last inbound message — never an instant reply. Set to 0
 * to disable. Manager-authored texts (CLAW_MESSENGER_MANAGER_PHONES_REFRESH_MS,
 * default 300000, controls how often the registered-manager roster is
 * refreshed from the webhook) always bypass the buffer.
 *
 * Usage (local):
 *   node --env-file=.env.local scripts/claw-messenger-gateway.mjs
 *
 * Usage (prod worker / always-on host):
 *   CLAW_MESSENGER_API_KEY=... AXIS_WEBHOOK_URL=https://www.axis-seattle-housing.com/api/webhooks/claw-messenger \
 *     node scripts/claw-messenger-gateway.mjs
 */

import { createHmac } from "node:crypto";
import WebSocket from "ws";

const apiKey = process.env.CLAW_MESSENGER_API_KEY?.trim();
const wsBase = process.env.CLAW_MESSENGER_WS_URL?.trim() || "wss://claw-messenger.onrender.com/ws";
const webhookUrl =
  process.env.AXIS_CLAW_WEBHOOK_URL?.trim() ||
  process.env.AXIS_WEBHOOK_URL?.trim() ||
  `${(process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/webhooks/claw-messenger`;
const webhookSecret = process.env.CLAW_MESSENGER_WEBHOOK_SECRET?.trim() || "";
const managerPhonesUrl = `${webhookUrl.replace(/\/$/, "")}/manager-phones`;

if (!apiKey) {
  console.error("CLAW_MESSENGER_API_KEY is required.");
  process.exit(1);
}

/*
 * Reply pacing (never reply instantly): buffer inbound prospect texts per
 * conversation and forward ONE consolidated frame after a quiet window from
 * the last inbound message, resetting on every new message in that window.
 *
 * Why here and not the webhook route: the webhook is a Vercel serverless
 * function — it can't cheaply sleep 2-3 minutes per request (cold-start cost,
 * function-duration limits, and no durable timer across invocations without a
 * new queue/cron). This gateway is already the one long-running, always-on
 * process in the pipeline (a persistent WS connection to Claw Messenger), so
 * an in-memory per-conversation timer is the simplest reliable place to hold
 * the debounce state. On a crash mid-buffer, `sinceIso` never advances past
 * the oldest still-pending frame, so Claw Messenger resends the buffered
 * window on reconnect — but the webhook skips replay frames by default
 * (CLAW_MESSENGER_PROCESS_REPLAYS unset), so those texts are NOT re-processed:
 * a hard crash with a non-empty buffer loses at most one quiet window of
 * prospect texts. That trade is deliberate — frequent gateway restarts make
 * duplicate replies a worse failure mode than a rare <=150s crash-loss window.
 * Durable webhook-side messageId idempotency (not just the in-memory
 * markInboundMessageSeen dedupe) is the prerequisite for safely flipping
 * CLAW_MESSENGER_PROCESS_REPLAYS on later.
 * SIGTERM/SIGINT flush immediately so a routine redeploy doesn't add latency.
 */
const debounceMs = (() => {
  const raw = Number(process.env.CLAW_MESSENGER_DEBOUNCE_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 0 ? raw : 150;
  return seconds * 1000;
})();
const managerPhonesRefreshMs = (() => {
  const raw = Number(process.env.CLAW_MESSENGER_MANAGER_PHONES_REFRESH_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * 60 * 1000;
})();

let backoffMs = 1000;
let sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const seen = new Set();

/* Manager phones bypass the debounce entirely — a manager composing through
 * the shared line expects the same latency they get today, not a 2-3 minute
 * hold meant for prospect auto-replies. The endpoint returns HMAC digests
 * (keyed on apiKey), not raw phone numbers — apiKey also travels in the
 * relay WS URL where upstream logs can capture it, so this set must not turn
 * into a bulk phone-directory leak for anyone who obtains it. */
let managerPhoneHashes = new Set();

/** Mirrors normalizeE164Us's digit convention (10-digit US number → prepend
 * country code "1") so a bare-national-format `from` still matches the
 * server's E.164-normalized hash instead of silently missing the manager
 * bypass and sitting in the prospect debounce. */
function normalizedPhoneDigits(from) {
  const digits = String(from ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function hashPhone(from) {
  const digits = normalizedPhoneDigits(from);
  if (!digits) return null;
  return createHmac("sha256", apiKey).update(digits).digest("hex");
}

async function refreshManagerPhones() {
  try {
    const res = await fetch(managerPhonesUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error(`[claw-gateway] manager-phones refresh HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    const hashes = Array.isArray(body.phoneHashes) ? body.phoneHashes : [];
    managerPhoneHashes = new Set(hashes.filter((h) => typeof h === "string" && h));
    console.log(`[claw-gateway] manager phones refreshed count=${managerPhoneHashes.size}`);
  } catch (err) {
    console.error("[claw-gateway] manager-phones refresh failed", err);
  }
}

function isManagerPhone(from) {
  const hash = hashPhone(from);
  return Boolean(hash) && managerPhoneHashes.has(hash);
}

/** Test-only: seed the manager-phone set (as plain E.164 numbers) without a network round-trip. */
function __setManagerPhonesForTest(phones) {
  managerPhoneHashes = new Set(phones.map((p) => hashPhone(p)).filter(Boolean));
}

/**
 * Replays (WS history sync on reconnect) and manager-authored texts skip the
 * quiet-window buffer entirely — replays are already historical, and a
 * manager composing through the line should not wait out the prospect
 * debounce meant for auto-replies.
 */
function shouldBypassDebounce(frame) {
  return frame.replay === true || debounceMs <= 0 || isManagerPhone(frame.from);
}

const debounceBuffers = new Map();

/* Frames flushed out of a buffer but whose delivery hasn't succeeded yet —
 * their arrival time must keep bounding `sinceIso` just like buffered ones. */
const inFlightDeliveries = new Set();

/** Earliest arrival among buffered + in-flight frames; Infinity when none. */
function oldestPendingArrivalMs() {
  let oldest = Infinity;
  for (const buf of debounceBuffers.values()) {
    if (buf.firstFrameAtMs < oldest) oldest = buf.firstFrameAtMs;
  }
  for (const marker of inFlightDeliveries) {
    if (marker.arrivalMs < oldest) oldest = marker.arrivalMs;
  }
  return oldest;
}

/* `sinceIso` is a single global reconnect-sync cursor shared by every
 * conversation. A successful delivery (including a manager-bypass delivery for
 * an unrelated conversation) must never advance it past a frame still sitting
 * in another conversation's debounce buffer, or a crash would drop that frame
 * out of the replay window. When nothing is pending, advance to now. */
function advanceSinceCursor() {
  const boundMs = Math.min(Date.now(), oldestPendingArrivalMs());
  const next = new Date(boundMs).toISOString();
  if (next > sinceIso) sinceIso = next;
}

function debounceKey(frame) {
  const digits = normalizedPhoneDigits(frame.from);
  if (digits) return digits;
  if (frame.chatId) return String(frame.chatId);
  // No phone digits AND no chatId: fall back to the message's own id (or a
  // random-ish per-call literal) rather than a shared "unknown" bucket — two
  // unrelated senders in this edge case must never merge into one
  // conversation's buffer.
  return frame.messageId ? `msg:${frame.messageId}` : `unknown:${Date.now()}:${Math.random()}`;
}

/** Returns the delivery promise so callers that need completion (graceful
 * shutdown) can await it — the WS message handler's normal path still fires
 * this without awaiting, which is fine there (nothing needs to block on it). */
function flushDebounceBuffer(key) {
  const buf = debounceBuffers.get(key);
  if (!buf) return null;
  debounceBuffers.delete(key);
  if (buf.timer) clearTimeout(buf.timer);
  if (buf.frames.length === 0) return null;
  const frames = buf.frames;
  const last = frames[frames.length - 1];
  const mergedText = frames
    .map((f) => String(f.text ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const merged = {
    ...last,
    text: mergedText,
    mergedCount: frames.length,
    mergedMessageIds: frames.map((f) => f.messageId).filter(Boolean),
  };
  console.log(
    `[claw-gateway] debounce flush key=${key} count=${frames.length} after ${debounceMs}ms quiet window`,
  );
  return deliverWithRetry(merged, buf.firstFrameAtMs);
}

function bufferForDebounce(frame) {
  const key = debounceKey(frame);
  const buf = debounceBuffers.get(key) ?? { frames: [], timer: null, firstFrameAtMs: Date.now() };
  buf.frames.push(frame);
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => flushDebounceBuffer(key), debounceMs);
  buf.timer.unref?.();
  debounceBuffers.set(key, buf);
  console.log(
    `[claw-gateway] buffered from=${frame.from || "?"} queue=${buf.frames.length} (resets ${debounceMs}ms quiet window)`,
  );
}

/** Awaits every pending delivery so a caller (graceful shutdown) can be sure
 * the HTTP POST actually left the process before it exits — `flushDebounceBuffer`
 * alone only starts the delivery, it doesn't wait for it. */
async function flushAllDebounceBuffers() {
  const pending = [...debounceBuffers.keys()].map((key) => flushDebounceBuffer(key)).filter(Boolean);
  await Promise.allSettled(pending);
}

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

async function deliverWithRetry(frame, arrivalMs = null) {
  const marker = arrivalMs != null ? { arrivalMs } : null;
  if (marker) inFlightDeliveries.add(marker);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (await forward(frame)) {
          if (marker) inFlightDeliveries.delete(marker);
          // Advance the reconnect-sync cursor only after a successful delivery
          // — a webhook outage must not permanently drop the inbound text —
          // and never past a frame another conversation still has pending.
          advanceSinceCursor();
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
  } finally {
    if (marker) inFlightDeliveries.delete(marker);
  }
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
      if (shouldBypassDebounce(frame)) {
        void deliverWithRetry(frame);
      } else {
        bufferForDebounce(frame);
      }
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

// Guard the network/process side effects behind "run directly" so unit tests
// can import the pure debounce/routing logic above without opening sockets,
// polling the manager-phones endpoint, or registering process signal handlers.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  void refreshManagerPhones();
  setInterval(refreshManagerPhones, managerPhonesRefreshMs).unref?.();

  // A routine redeploy/restart must not silently drop a buffered prospect
  // reply — flush pending debounce windows and WAIT for the delivery to
  // actually leave the process before exiting. process.exit() does not drain
  // pending I/O, so firing the flush without awaiting it (or exiting
  // immediately after) would start the HTTP POST and then kill it mid-flight
  // — a bounded wait (capped at 8s) is required, not just calling the flush.
  const gracefulShutdown = async () => {
    await Promise.race([
      flushAllDebounceBuffers(),
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void gracefulShutdown());
  process.on("SIGINT", () => void gracefulShutdown());

  connect();
}

export {
  debounceMs,
  debounceKey,
  bufferForDebounce,
  flushDebounceBuffer,
  flushAllDebounceBuffers,
  debounceBuffers,
  isManagerPhone,
  shouldBypassDebounce,
  refreshManagerPhones,
  deliverWithRetry,
  __setManagerPhonesForTest,
};
