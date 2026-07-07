#!/usr/bin/env node
/**
 * Export All Property Management company emails + phone numbers.
 *
 * Fetches the full manager catalog (~2,800 companies) from the public API,
 * then loads each profile for Email + phone numbers embedded in HtmlProfile.
 *
 * Usage:
 *   node scripts/scrape-apm-contacts.mjs
 *   node scripts/scrape-apm-contacts.mjs --output data/scrapes/apm-contacts
 *   node scripts/scrape-apm-contacts.mjs --limit 50          # smoke test
 *   node scripts/scrape-apm-contacts.mjs --concurrency 6 --delay 80
 *
 * Outputs:
 *   property-managers-contacts.json   — one row per manager
 *   property-managers-contacts.csv    — same data, spreadsheet-friendly
 *   manifest.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API = "https://api.allpropertymanagement.com/public/v1";
const USER_AGENT = "AxisAPMContactsExport/1.0 (+research; axis-seattle-housing.com)";

function parseArgs(argv) {
  const opts = {
    output: `data/scrapes/apm-contacts-${new Date().toISOString().slice(0, 10)}`,
    delayMs: 100,
    concurrency: 5,
    limit: 0,
    resume: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") opts.output = argv[++i] ?? opts.output;
    else if (arg === "--delay") opts.delayMs = Number(argv[++i] ?? opts.delayMs);
    else if (arg === "--concurrency") opts.concurrency = Number(argv[++i] ?? opts.concurrency);
    else if (arg === "--limit") opts.limit = Number(argv[++i] ?? opts.limit);
    else if (arg === "--no-resume") opts.resume = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/scrape-apm-contacts.mjs [options]

  --output <dir>       Output directory
  --delay <ms>         Delay between batch starts (default: 100)
  --concurrency <n>    Parallel profile fetches (default: 5)
  --limit <n>          Only process first N managers (testing)
  --no-resume          Ignore checkpoint and start fresh
`);
      process.exit(0);
    }
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${url}`);
  }
  return res.json();
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeEmail(raw) {
  const email = raw.trim().toLowerCase();
  if (!email.includes("@") || email.includes(" ")) return null;
  return email;
}

function extractEmails(emailField, htmlProfile) {
  const emails = new Set();
  if (typeof emailField === "string" && emailField.trim()) {
    for (const part of emailField.split(/[,;]+/)) {
      const email = normalizeEmail(part);
      if (email) emails.add(email);
    }
  }
  const html = htmlProfile ?? "";
  for (const match of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const email = normalizeEmail(decodeURIComponent(match[1] ?? ""));
    if (email) emails.add(email);
  }
  return [...emails];
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function formatPhone(digits) {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function extractPhones(htmlProfile) {
  const phones = new Set();
  const html = htmlProfile ?? "";
  for (const match of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const normalized = normalizePhone(match[1] ?? "");
    if (normalized) phones.add(normalized);
  }
  const patterns = [
    /\+1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\b\d{3}[-.]\d{3}[-.]\d{4}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const normalized = normalizePhone(match[0] ?? "");
      if (normalized) phones.add(normalized);
    }
  }
  return [...phones].map(formatPhone);
}

function profileToContact(profile) {
  const emails = extractEmails(profile.Email, profile.HtmlProfile);
  const phones = extractPhones(profile.HtmlProfile);
  return {
    id: profile.Id,
    name: profile.Name ?? "",
    emails,
    phones,
    email: emails[0] ?? "",
    phone: phones[0] ?? "",
    street: profile.Address?.Street ?? "",
    city: profile.Address?.City ?? "",
    state: profile.Address?.State ?? "",
    zip: profile.Address?.Zipcode ?? "",
    tagLine: profile.TagLine ?? "",
    propertyTypes: (profile.PropertyTypes ?? []).map((t) => t.Name),
    isFeatured: Boolean(profile.Value),
    hasHtmlProfile: Boolean(profile.HtmlProfile?.trim()),
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const headers = [
    "id",
    "name",
    "email",
    "emails",
    "phone",
    "phones",
    "street",
    "city",
    "state",
    "zip",
    "tagLine",
    "propertyTypes",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.name,
        row.email,
        row.emails.join("; "),
        row.phone,
        row.phones.join("; "),
        row.street,
        row.city,
        row.state,
        row.zip,
        row.tagLine,
        row.propertyTypes.join("; "),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function loadCheckpoint(checkpointPath) {
  try {
    const raw = await readFile(checkpointPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let index = 0;
  async function loop() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => loop()));
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(opts.output);
  const checkpointPath = path.join(outDir, ".checkpoint.json");
  await mkdir(outDir, { recursive: true });

  console.log(`Fetching manager catalog → ${outDir}`);

  let catalog = await fetchJson(`${API}/propertyManagers`);
  if (opts.limit > 0) catalog = catalog.slice(0, opts.limit);

  const ids = catalog.map((row) => row.Id);
  console.log(`Catalog: ${ids.length} property managers`);

  let completed = new Map();
  if (opts.resume) {
    const checkpoint = await loadCheckpoint(checkpointPath);
    if (checkpoint?.contacts) {
      for (const row of checkpoint.contacts) completed.set(row.id, row);
      console.log(`Resuming: ${completed.size} profiles already fetched`);
    }
  }

  const pending = ids.filter((id) => !completed.has(id));
  let processed = 0;
  const errors = [];

  const batchSize = opts.concurrency;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    await runPool(batch, async (id) => {
      try {
        const profile = await fetchJson(`${API}/propertyManagers/${id}`);
        completed.set(id, profileToContact(profile));
      } catch (e) {
        errors.push({ id, error: String(e.message ?? e) });
      }
      processed++;
      if (processed % 25 === 0 || processed === pending.length) {
        process.stdout.write(`\rProfiles: ${completed.size}/${ids.length} (${errors.length} errors)`);
      }
    }, batchSize);

    await writeJson(checkpointPath, {
      updatedAt: new Date().toISOString(),
      contacts: [...completed.values()].sort((a, b) => a.id - b.id),
    });
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  console.log("");

  const contacts = [...completed.values()].sort((a, b) => a.id - b.id);
  const withEmail = contacts.filter((c) => c.emails.length > 0);
  const withPhone = contacts.filter((c) => c.phones.length > 0);

  await writeJson(path.join(outDir, "property-managers-contacts.json"), {
    scrapedAt: new Date().toISOString(),
    source: API,
    count: contacts.length,
    withEmail: withEmail.length,
    withPhone: withPhone.length,
    contacts,
  });

  await writeFile(path.join(outDir, "property-managers-contacts.csv"), toCsv(contacts), "utf8");

  const manifest = {
    scrapedAt: new Date().toISOString(),
    source: "https://www.allpropertymanagement.com",
    api: API,
    stats: {
      total: contacts.length,
      withEmail: withEmail.length,
      withPhone: withPhone.length,
      withoutEmail: contacts.length - withEmail.length,
      withoutPhone: contacts.length - withPhone.length,
      errors: errors.length,
    },
    files: {
      json: "property-managers-contacts.json",
      csv: "property-managers-contacts.csv",
    },
    errors,
  };
  await writeJson(path.join(outDir, "manifest.json"), manifest);

  console.log("Done.");
  console.log(JSON.stringify(manifest.stats, null, 2));
  console.log(`Wrote ${path.join(outDir, "property-managers-contacts.csv")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
