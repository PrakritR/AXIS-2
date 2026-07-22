#!/usr/bin/env node
/**
 * Regenerates the homepage guide art in `public/marketing/` from the portal's
 * own markup and tokens.
 *
 * Both boards are authored at 900x460 CSS px and captured at 2x, so the files
 * land at the 1800x920 the `.lp-chapter .lp-art` box expects (see AGENTS.md,
 * "Marketing mocks must use portal-accurate copy").
 *
 * Every count rendered on a board is DERIVED from the rows/cells the board
 * actually draws — the per-day "N open" headers and the week total come from
 * the slot grid, and the Schedule tab badge comes from the message list — so a
 * mock can never claim a number its own screenshot contradicts.
 *
 * Usage: node scripts/generate-marketing-guide-art.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "public", "marketing");
const WIDTH = 900;
const HEIGHT = 460;
const SCALE = 2;
const QUALITY = 92;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

/* ---------------------------------------------------------------- content */

/**
 * Calendar → availability week. `slots[i]` is the cell drawn at `TOUR_TIMES[i]`:
 * "open" renders the green Open slot, an object renders a booked tour, null
 * renders an empty cell.
 */
const TOUR_TIMES = ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"];

const TOUR_DAYS = [
  { weekday: "Tue", date: "Jul 21", slots: ["open", "open", { tour: "P. Nair" }, "open", "open"] },
  { weekday: "Wed", date: "Jul 22", slots: [{ tour: "M. Chen" }, "open", "open", "open", null] },
  { weekday: "Thu", date: "Jul 23", slots: ["open", null, "open", "open", { tour: "J. Lee" }] },
  { weekday: "Fri", date: "Jul 24", slots: [null, { tour: "D. Ramos" }, "open", "open", "open"] },
  { weekday: "Sat", date: "Jul 25", slots: ["open", "open", null, "open", "open"] },
];

const openSlotCount = (day) => day.slots.filter((slot) => slot === "open").length;
const WEEK_OPEN_COUNT = TOUR_DAYS.reduce((total, day) => total + openSlotCount(day), 0);

/** Communication → Schedule tab rows. */
const SCHEDULE_ROWS = [
  {
    sendAt: "Jul 22, 9:00 AM",
    name: "Maya Chen",
    email: "maya.chen@example.com",
    topic: "August rent",
    unit: "Cascade Lofts · 4B",
    subject: "Rent due in 3 days",
  },
  {
    sendAt: "Jul 24, 8:00 AM",
    name: "Dev Ramos",
    email: "dev.ramos@example.com",
    topic: "Tour confirmation",
    unit: "Ballard Commons · 1C",
    subject: "Your tour is confirmed",
  },
  {
    sendAt: "Jul 28, 9:00 AM",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    topic: "Lease renewal",
    unit: "Cascade Lofts · 2A",
    subject: "Renewal terms ready",
  },
  {
    sendAt: "Aug 1, 9:00 AM",
    name: "Jordan Lee",
    email: "jordan.lee@example.com",
    topic: "August rent",
    unit: "Cascade Court · 3A",
    subject: "Rent is due today",
  },
];

/** `INBOX_TAB_DEFS` order; Schedule's badge is the row count this board draws. */
const INBOX_TABS = [
  { label: "Unopened", count: 2 },
  { label: "Opened", count: 0 },
  { label: "Schedule", count: SCHEDULE_ROWS.length, active: true },
  { label: "Sent", count: 1 },
  { label: "Trash", count: 0 },
];

/* ------------------------------------------------------------------ markup */

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #fdfdfd;
    color: #17181a;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", ui-sans-serif, system-ui, sans-serif;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  .board { padding: 24px 26px; }
  .pill-btn {
    display: inline-flex; align-items: center;
    border: 1px solid #e4e6ea; background: #fff; border-radius: 999px;
    padding: 7px 17px; font-size: 13px; font-weight: 600; color: #17181a;
  }
  .badge-success {
    border-radius: 999px; background: rgb(209 250 229); color: rgb(6 95 70);
    padding: 5px 13px; font-size: 13px; font-weight: 700;
  }
  .card { border: 1px solid #e8e8e8; border-radius: 14px; background: #fff; overflow: hidden; }
`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function toursHtml() {
  const headerCells = TOUR_DAYS.map(
    (day) => `
      <div class="hc day">
        <p class="wd">${escapeHtml(day.weekday)}</p>
        <p class="dt">${escapeHtml(day.date)}</p>
        <p class="oc">${openSlotCount(day)} open</p>
      </div>`,
  ).join("");

  const bodyRows = TOUR_TIMES.map((time, rowIdx) => {
    const edge = rowIdx === 0 ? "" : " ln";
    const cells = TOUR_DAYS.map((day) => {
      const slot = day.slots[rowIdx];
      if (slot === "open") return `<div class="sc${edge}"><span class="slot open">Open</span></div>`;
      if (slot && slot.tour)
        return `<div class="sc${edge}"><span class="slot tour">Tour · ${escapeHtml(slot.tour)}</span></div>`;
      return `<div class="sc${edge}"></div>`;
    }).join("");
    return `<div class="tc${edge}">${escapeHtml(time)}</div>${cells}`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .top { display: flex; align-items: center; gap: 11px; }
    .nav {
      display: flex; align-items: center; justify-content: center;
      height: 31px; width: 31px; border-radius: 999px; border: 1px solid #e8e8e8;
      background: #fff; font-size: 14px; color: #17181a;
    }
    .week { border: 1px solid #e8e8e8; border-radius: 14px; background: #fff; padding: 7px 17px; }
    .week .lab { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #5c6068; }
    .week .rng { margin: 1px 0 0; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    .week .scope { margin: 1px 0 0; font-size: 11px; font-weight: 600; color: #2f6bff; }
    .week p { margin: 0; }
    .spacer { flex: 1; }
    .actions { display: flex; gap: 10px; margin-top: 15px; }
    .grid {
      display: grid; grid-template-columns: 84px repeat(5, 1fr);
      margin-top: 17px; font-size: 12px;
    }
    .hc { background: #e7edff; padding: 7px 6px; }
    .hc.time { display: flex; align-items: center; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5c6068; padding-left: 12px; }
    .hc.day { text-align: center; }
    .hc p { margin: 0; }
    .hc .wd { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5c6068; }
    .hc .dt { margin-top: 1px; font-size: 12px; font-weight: 700; color: #17181a; }
    .hc .oc { margin-top: 1px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #15794a; }
    .tc { display: flex; align-items: center; height: 36px; padding-left: 12px; font-size: 12px; font-weight: 600; color: #5c6068; }
    .sc { display: flex; align-items: center; height: 36px; padding: 0 7px; }
    .ln { border-top: 1px solid #ededed; }
    .slot {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 26px; border-radius: 8px; font-size: 12px; font-weight: 600;
    }
    .slot.open { background: #d9fbe6; color: #15794a; box-shadow: inset 0 0 0 1px #b3e0c3; }
    .slot.tour { background: #e7edff; color: #4a6fd6; box-shadow: inset 0 0 0 1px #d3ddfb; }
  </style></head><body><div class="board">
    <div class="top">
      <span class="nav">←</span>
      <div class="week">
        <p class="lab">Your availability</p>
        <p class="rng">Jul 21 – Jul 25, 2026</p>
        <p class="scope">Calendar · Ballard Commons</p>
      </div>
      <span class="nav">→</span>
      <span class="spacer"></span>
      <span class="badge-success">${WEEK_OPEN_COUNT} open</span>
    </div>
    <div class="actions">
      <span class="pill-btn">Copy previous week</span>
      <span class="pill-btn">Create block</span>
      <span class="pill-btn">Clear week</span>
      <span class="pill-btn">Update to houses</span>
    </div>
    <div class="card grid">
      <div class="hc time">Time</div>
      ${headerCells}
      ${bodyRows}
    </div>
  </div></body></html>`;
}

function messagesHtml() {
  const tabs = INBOX_TABS.map(
    (tab) => `
      <span class="tab${tab.active ? " on" : ""}">
        ${escapeHtml(tab.label)}<span class="chip">${tab.count}</span>
      </span>`,
  ).join("");

  const rows = SCHEDULE_ROWS.map(
    (row) => `
      <tr>
        <td class="when">${escapeHtml(row.sendAt)}</td>
        <td><span class="src">Automated</span></td>
        <td><p class="nm">${escapeHtml(row.name)}</p><p class="sub">${escapeHtml(row.email)}</p></td>
        <td><p class="tp">${escapeHtml(row.topic)}</p><p class="sub">${escapeHtml(row.unit)}</p></td>
        <td class="subj">${escapeHtml(row.subject)} <span class="chev">›</span></td>
        <td><span class="status">Scheduled</span></td>
      </tr>`,
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
    .tabs { display: inline-flex; align-items: center; gap: 2px; margin-top: 14px; background: #ebf0fc; border-radius: 999px; padding: 5px; }
    .tab { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 15px; font-size: 13.5px; font-weight: 600; color: #4a4f57; }
    .tab.on { background: #fff; color: #17181a; box-shadow: 0 1px 2px rgba(8, 9, 11, 0.1); }
    .chip { margin-left: 7px; border-radius: 999px; background: #e3e8f2; padding: 0 6px; font-size: 11px; font-weight: 700; color: #4a4f57; }
    .tab.on .chip { background: #e7edff; color: #3b5ce0; }
    .rule { margin-top: 14px; border-top: 1px solid #ececec; }
    table { width: 100%; margin-top: 16px; border-collapse: collapse; table-layout: fixed; }
    th { background: #eff3ff; padding: 11px 13px; text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #5c6068; }
    td { padding: 11px 13px; border-top: 1px solid #efefef; vertical-align: middle; }
    tr:first-child td { border-top: 0; }
    td p { margin: 0; }
    .when { font-size: 12.5px; font-weight: 600; color: #17181a; }
    .src { display: inline-flex; border: 1px solid #e2e8f8; border-radius: 999px; background: #eff4fd; padding: 2px 9px; font-size: 11px; font-weight: 600; color: #4a4f57; }
    .nm { font-size: 13.5px; font-weight: 700; color: #17181a; }
    .tp { font-size: 12.5px; color: #17181a; }
    .sub { font-size: 11px; color: #8a8f98; }
    .subj { font-size: 12.5px; font-weight: 600; color: #17181a; }
    .chev { color: #8a8f98; }
    .status { display: inline-flex; border-radius: 999px; background: #e7edff; padding: 3px 10px; font-size: 11.5px; font-weight: 700; color: #3b5ce0; }
  </style></head><body><div class="board">
    <h1>Communication</h1>
    <div class="tabs">${tabs}</div>
    <div class="rule"></div>
    <div class="card"><table>
      <thead><tr>
        <th style="width: 17%">Send date &amp; time</th>
        <th style="width: 13%">Source</th>
        <th style="width: 21%">Recipient</th>
        <th style="width: 21%">Topic</th>
        <th style="width: 18%">Subject</th>
        <th style="width: 14%">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div></body></html>`;
}

/* -------------------------------------------------------------------- CDP */

function resolveChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`No Chrome binary found. Set CHROME_PATH. Tried:\n${CHROME_CANDIDATES.join("\n")}`);
  return found;
}

async function withChrome(run) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "proplane-guide-art-"));
  const chrome = spawn(
    resolveChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const portFile = path.join(userDataDir, "DevToolsActivePort");
    let port = null;
    for (let attempt = 0; attempt < 200 && port === null; attempt += 1) {
      if (fs.existsSync(portFile)) {
        const first = fs.readFileSync(portFile, "utf8").split("\n")[0]?.trim();
        if (first) port = first;
      }
      if (port === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (port === null) throw new Error("Chrome did not expose a DevTools port.");

    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("DevTools socket failed")), { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = (nextId += 1);
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });

    try {
      return await run(send);
    } finally {
      socket.close();
    }
  } finally {
    chrome.kill();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function capture(send, html) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false },
    sessionId,
  );
  const { frameTree } = await send("Page.getFrameTree", {}, sessionId);
  await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html }, sessionId);
  await send(
    "Runtime.evaluate",
    { expression: "document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))", awaitPromise: true },
    sessionId,
  );
  const shot = await send(
    "Page.captureScreenshot",
    { format: "webp", quality: QUALITY, captureBeyondViewport: false },
    sessionId,
  );
  await send("Target.closeTarget", { targetId });
  return Buffer.from(shot.data, "base64");
}

/* -------------------------------------------------------------------- main */

const boards = [
  { file: "guide-messages.webp", html: messagesHtml() },
  { file: "guide-tours.webp", html: toursHtml() },
];

await withChrome(async (send) => {
  for (const board of boards) {
    const bytes = await capture(send, board.html);
    fs.writeFileSync(path.join(OUT_DIR, board.file), bytes);
    console.log(`${board.file}  ${WIDTH * SCALE}x${HEIGHT * SCALE}  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
});

console.log(
  `guide-tours open counts: ${TOUR_DAYS.map((d) => `${d.weekday} ${openSlotCount(d)}`).join(", ")} — week total ${WEEK_OPEN_COUNT}`,
);
console.log(`guide-messages Schedule badge: ${SCHEDULE_ROWS.length} (rows drawn: ${SCHEDULE_ROWS.length})`);
