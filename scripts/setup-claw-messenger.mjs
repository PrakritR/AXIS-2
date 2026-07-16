#!/usr/bin/env node
/**
 * Claw Messenger phone-number setup (https://www.clawmessenger.com/docs#phone-numbers).
 *
 * Registers the phones PropLane should hear from, optionally sets primary, prints
 * the live route list, and reminds you to keep the WebSocket gateway running.
 *
 * Usage:
 *   npm run claw:setup
 *   npm run claw:setup -- --primary=+15103098345
 *   npm run claw:setup -- --register=+15551234567,+15559876543
 *   npm run claw:setup -- --send-test=+15103098345
 */

const apiKey = process.env.CLAW_MESSENGER_API_KEY?.trim();
const httpBase =
  process.env.CLAW_MESSENGER_HTTP_BASE?.trim() || "https://claw-messenger.onrender.com";
const agentPhone =
  process.env.CLAW_MESSENGER_AGENT_PHONE?.trim() ||
  process.env.NEXT_PUBLIC_CLAW_MESSENGER_AGENT_PHONE?.trim() ||
  "+12053690702";

if (!apiKey) {
  console.error("CLAW_MESSENGER_API_KEY is required (set in .env.local).");
  process.exit(1);
}

function parseArgs(argv) {
  const out = { register: [], primary: null, sendTest: null, help: false };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") out.help = true;
    else if (raw.startsWith("--primary=")) out.primary = raw.slice("--primary=".length).trim();
    else if (raw.startsWith("--register=")) {
      out.register.push(
        ...raw
          .slice("--register=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (raw.startsWith("--send-test=")) out.sendTest = raw.slice("--send-test=".length).trim();
  }
  return out;
}

function normalizeE164Us(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw).trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

function phonesFromEnv() {
  const list = [];
  const push = (raw) => {
    const n = normalizeE164Us(raw);
    if (n) list.push(n);
  };
  for (const part of (process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES ?? "").split(",")) push(part);
  push(process.env.CLAW_MESSENGER_DEFAULT_RESIDENT_PHONE);
  return [...new Set(list)];
}

async function api(method, path, body) {
  const res = await fetch(`${httpBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function listRoutes() {
  const r = await api("GET", "/api/routes");
  if (!r.ok) throw new Error(`GET /api/routes → ${r.status} ${r.text.slice(0, 200)}`);
  return Array.isArray(r.json) ? r.json : [];
}

async function registerPhone(phone) {
  const phoneNumber = normalizeE164Us(phone);
  if (!phoneNumber) return { ok: false, phone, error: "invalid_phone" };
  const r = await api("POST", "/api/routes", { phone_number: phoneNumber });
  if (!r.ok) {
    return {
      ok: false,
      phone: phoneNumber,
      error: r.json?.detail || r.json?.error || r.text.slice(0, 200) || `HTTP ${r.status}`,
    };
  }
  return {
    ok: true,
    phone: phoneNumber,
    already_claimed: Boolean(r.json?.already_claimed),
  };
}

async function setPrimary(phone) {
  const phoneNumber = normalizeE164Us(phone);
  if (!phoneNumber) return { ok: false, error: "invalid_phone" };
  // Docs: PUT /api/routes/primary
  const r = await api("PUT", "/api/routes/primary", { phone_number: phoneNumber });
  if (!r.ok) {
    return {
      ok: false,
      error: r.json?.detail || r.json?.error || r.text.slice(0, 200) || `HTTP ${r.status}`,
    };
  }
  return { ok: true, phone: phoneNumber };
}

async function sendControlledTest(toPhone) {
  const to = normalizeE164Us(toPhone);
  if (!to) return { ok: false, error: "invalid_phone" };
  const WebSocket = (await import("ws")).default;
  const wsUrl =
    (process.env.CLAW_MESSENGER_WS_URL?.trim() || "wss://claw-messenger.onrender.com/ws") +
    `?key=${encodeURIComponent(apiKey)}`;
  const id = `setup-test-${Date.now()}`;

  return await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: "Timed out waiting for send.result" });
    }, 20_000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "send",
          id,
          to,
          parts: [
            {
              type: "text",
              value:
                "Axis Claw Messenger setup test. Reply YES if you got this — that reply must reach the gateway/webhook.",
            },
          ],
        }),
      );
    });

    ws.on("message", (data) => {
      let frame;
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }
      if (frame.type !== "send.result" || frame.id !== id) return;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({
        ok: frame.ok === true,
        status: frame.status,
        messageId: frame.messageId,
        error: frame.error,
        setupProof: frame.setupProof,
      });
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message || "WebSocket error" });
    });
  });
}

function printRoutes(routes) {
  console.log("\nRegistered numbers (agent can hear from these):");
  if (routes.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const row of routes) {
    const primary = row.is_primary ? " PRIMARY" : "";
    const last = row.last_message_at ? row.last_message_at.slice(0, 10) : "None";
    console.log(`  ${row.phone_number}${primary}  last=${last}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: npm run claw:setup [--register=+1...,+1...] [--primary=+1...] [--send-test=+1...]`);
    process.exit(0);
  }

  console.log("Claw Messenger setup");
  console.log(`  HTTP  ${httpBase}`);
  console.log(`  Agent line (people text THIS number): ${agentPhone}`);
  console.log(`  Enabled flag: ${process.env.CLAW_MESSENGER_ENABLED || process.env.NEXT_PUBLIC_CLAW_MESSENGER_ENABLED || "(unset)"}`);

  const health = await api("GET", "/health");
  console.log(`  Health: ${health.ok ? "ok" : `fail ${health.status}`}`);

  const toRegister = [...new Set([...phonesFromEnv(), ...args.register.map((p) => normalizeE164Us(p)).filter(Boolean)])];
  if (toRegister.length > 0) {
    console.log(`\nRegistering ${toRegister.length} number(s) via POST /api/routes …`);
    for (const phone of toRegister) {
      const result = await registerPhone(phone);
      if (result.ok) {
        console.log(`  ✓ ${result.phone}${result.already_claimed ? " (already claimed)" : ""}`);
      } else {
        console.error(`  ✗ ${result.phone}: ${result.error}`);
      }
    }
  }

  const primaryTarget =
    normalizeE164Us(args.primary) ||
    normalizeE164Us(process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES?.split(",")[0] ?? "");
  if (primaryTarget) {
    const routesBefore = await listRoutes();
    const already = routesBefore.find((r) => r.phone_number === primaryTarget && r.is_primary);
    if (already) {
      console.log(`\nPrimary already ${primaryTarget}`);
    } else {
      console.log(`\nSetting primary → ${primaryTarget}`);
      const set = await setPrimary(primaryTarget);
      if (set.ok) console.log(`  ✓ primary ${set.phone}`);
      else console.error(`  ✗ primary: ${set.error}`);
    }
  }

  const routes = await listRoutes();
  printRoutes(routes);

  if (args.sendTest) {
    console.log(`\nSending controlled test to ${args.sendTest} …`);
    const sent = await sendControlledTest(args.sendTest);
    if (sent.ok) {
      console.log(`  ✓ send accepted status=${sent.status || "?"} messageId=${sent.messageId || "?"}`);
      if (sent.setupProof?.message) console.log(`  setupProof: ${sent.setupProof.message}`);
      console.log("  → Reply YES from that phone. Gateway must forward the inbound message to Axis.");
    } else {
      console.error(`  ✗ send failed: ${sent.error || sent.status}`);
    }
  }

  const webhookHint =
    process.env.AXIS_CLAW_WEBHOOK_URL?.trim() ||
    process.env.AXIS_WEBHOOK_URL?.trim() ||
    `${(process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/webhooks/claw-messenger`;

  console.log(`
Next steps (docs quickstart):
  1. Keep the gateway connected so inbound replies are not dropped:
       npm run claw:gateway
     (forwards to ${webhookHint})
  2. People text the agent line ${agentPhone} from a registered phone above.
  3. Controlled proof: npm run claw:setup -- --send-test=${primaryTarget || "+1XXXXXXXXXX"}
     then reply YES from that phone and confirm /api/webhooks/claw-messenger logs a hit.
  4. Production managers still use per-account Twilio work numbers; Claw is the shared
     iMessage/SMS agent line (CLAW_MESSENGER_ENABLED=1).
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
