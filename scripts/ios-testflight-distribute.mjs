#!/usr/bin/env node
// Assign a freshly uploaded TestFlight build to the internal tester group, then
// PROVE the assignment stuck by re-reading the App Store Connect API.
//
// Why this exists as a separate step instead of options on `upload_to_testflight`:
// fastlane's pilot cannot both `skip_waiting_for_build_processing` and assign the
// build to a tester group in one call — assignment requires Apple to have finished
// processing the binary. The old lane skipped the wait, so builds 33-37 uploaded
// "successfully" and sat in App Store Connect with an EMPTY Groups column: green
// CI, nothing anybody could install. Keeping the upload fast and doing the wait +
// assignment + verification here means the run is red whenever the build is not
// actually installable, which is the whole point.
//
// Usage:
//   node scripts/ios-testflight-distribute.mjs                 # build from $TESTFLIGHT_BUILD_NUMBER
//   node scripts/ios-testflight-distribute.mjs --build=38      # explicit build number
//   node scripts/ios-testflight-distribute.mjs --verify-only   # report state, change nothing
//
// Auth (same secrets the workflow already sets):
//   ASC_KEY_ID     App Store Connect API key id
//   ASC_ISSUER_ID  App Store Connect issuer id
//   ASC_KEY_P8     the AuthKey_XXXX.p8 contents, base64 or raw PEM
//   ASC_KEY_P8_PATH  alternative to ASC_KEY_P8 — path to the .p8 file (local runs)
//
// Optional:
//   TESTFLIGHT_APP_ID                       expected numeric app id (default 6795707576)
//   TESTFLIGHT_BUNDLE_ID                    default space.proplane.app
//   TESTFLIGHT_INTERNAL_GROUP               exact beta group name (default "Internal — PropLane team")
//   TESTFLIGHT_PROCESSING_TIMEOUT_SECONDS   bound on the processing wait (default 1500)

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const ASC_BASE = "https://api.appstoreconnect.apple.com/v1";

// The canonical PropLane app record. The pre-rebrand record
// (com.axisseattlehousing.app, shown as "PropLane Legacy") is dead but still
// installable and its build numbers are HIGHER, so pinning the app id here is a
// real guard, not ceremony — see AGENTS.md "Two iOS app records".
const DEFAULT_APP_ID = "6795707576";
const DEFAULT_BUNDLE_ID = "space.proplane.app";
const DEFAULT_GROUP_NAME = "Internal — PropLane team";

const TERMINAL_PROCESSING_FAILURES = new Set(["FAILED", "INVALID"]);
const FATAL_INTERNAL_BUILD_STATES = new Set(["MISSING_EXPORT_COMPLIANCE", "PROCESSING_EXCEPTION"]);

/** Beta group names are compared exactly, after NFC + trim. */
export function normalizeGroupName(name) {
  return String(name ?? "")
    .normalize("NFC")
    .trim();
}

/**
 * Find the beta group whose name matches `expectedName` exactly.
 *
 * Deliberately throws rather than falling back to "the first internal group" —
 * silently distributing to the wrong group is the failure mode we are
 * eliminating, and an external group must never be picked at all.
 */
export function selectBetaGroup(groups, expectedName) {
  const wanted = normalizeGroupName(expectedName);
  const inventory = groups
    .map((group) => {
      const kind = group?.attributes?.isInternalGroup ? "internal" : "external";
      return `  - ${JSON.stringify(group?.attributes?.name ?? "")} (${kind})`;
    })
    .join("\n");

  const match = groups.find((group) => normalizeGroupName(group?.attributes?.name) === wanted);
  if (!match) {
    throw new Error(
      `No TestFlight beta group named ${JSON.stringify(wanted)} exists on this app.\n` +
        `Groups that do exist:\n${inventory || "  (none)"}\n` +
        "Create the group in App Store Connect, or set TESTFLIGHT_INTERNAL_GROUP to an existing name.",
    );
  }
  if (!match.attributes?.isInternalGroup) {
    throw new Error(
      `Beta group ${JSON.stringify(wanted)} is an EXTERNAL group. This script only ever ` +
        "distributes to internal groups (external testing needs App Review, which we do not do here).",
    );
  }
  return match;
}

function loadPrivateKeyPem() {
  const path = process.env.ASC_KEY_P8_PATH;
  if (path) return readFileSync(path, "utf8");

  const raw = process.env.ASC_KEY_P8;
  if (!raw) {
    throw new Error("Set ASC_KEY_P8 (base64 or raw PEM) or ASC_KEY_P8_PATH.");
  }
  if (raw.includes("BEGIN PRIVATE KEY")) return raw;

  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (decoded.includes("BEGIN PRIVATE KEY")) return decoded;
  throw new Error("ASC_KEY_P8 is neither a PEM private key nor base64 of one.");
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function mintToken() {
  const keyId = requireEnv("ASC_KEY_ID");
  const issuerId = requireEnv("ASC_ISSUER_ID");
  const key = createPrivateKey(loadPrivateKeyPem());

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(
    // 20 minutes is Apple's maximum for a team-scoped key.
    JSON.stringify({ iss: issuerId, iat: issuedAt, exp: issuedAt + 20 * 60, aud: "appstoreconnect-v1" }),
  );
  // JWS wants the raw r||s pair, not the DER sequence node emits by default.
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

function describeApiError(body) {
  const errors = body?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return JSON.stringify(body);
  return errors
    .map((error) => [error.title, error.detail, error.code].filter(Boolean).join(" — "))
    .join("; ");
}

class AscClient {
  constructor(token) {
    this.token = token;
  }

  async request(method, path, body) {
    const url = path.startsWith("http") ? path : `${ASC_BASE}/${path.replace(/^\/+/, "")}`;
    let lastError;
    // Apple's API 429s and 5xxs under load; a bounded retry keeps a whole build
    // cycle from being wasted on a transient blip.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (response.status === 204) return null;
      const text = await response.text();
      const parsed = text ? safeJsonParse(text) : null;
      if (response.ok) return parsed;

      lastError = new Error(
        `${method} ${url} → HTTP ${response.status}: ${parsed ? describeApiError(parsed) : text.slice(0, 500)}`,
      );
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 4) throw lastError;
      const backoffMs = 2000 * attempt;
      console.log(`  ↻ ${response.status} from App Store Connect; retrying in ${backoffMs / 1000}s`);
      await sleep(backoffMs);
    }
    throw lastError;
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body) {
    return this.request("POST", path, body);
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resolveApp(client, bundleId, expectedAppId) {
  const body = await client.get(`apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=2`);
  const apps = body?.data ?? [];
  if (apps.length === 0) {
    throw new Error(`No App Store Connect app found for bundle id ${bundleId}.`);
  }
  if (apps.length > 1) {
    throw new Error(
      `Bundle id ${bundleId} matched ${apps.length} apps (${apps.map((app) => app.id).join(", ")}).`,
    );
  }
  const app = apps[0];
  if (expectedAppId && app.id !== expectedAppId) {
    throw new Error(
      `Bundle id ${bundleId} resolved to app ${app.id}, but TESTFLIGHT_APP_ID expects ${expectedAppId}. ` +
        "Refusing to distribute — this is exactly how the legacy app record swallowed builds.",
    );
  }
  return app;
}

async function findBuild(client, appId, buildNumber) {
  const query = new URLSearchParams({
    "filter[app]": appId,
    "filter[version]": buildNumber,
    limit: "10",
  });
  const body = await client.get(`builds?${query}`);
  const builds = body?.data ?? [];
  if (builds.length > 1) {
    throw new Error(
      `Build number ${buildNumber} matched ${builds.length} builds on app ${appId} ` +
        `(${builds.map((build) => build.id).join(", ")}); cannot pick one safely.`,
    );
  }
  return builds[0] ?? null;
}

/** Poll until the build exists and Apple has finished processing it, or the deadline passes. */
async function waitForProcessedBuild(client, appId, buildNumber, timeoutSeconds) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  let lastState = null;

  for (;;) {
    const build = await findBuild(client, appId, buildNumber);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const state = build ? (build.attributes?.processingState ?? "UNKNOWN") : "NOT_YET_VISIBLE";

    if (state !== lastState) {
      console.log(`  [${elapsed}s] build ${buildNumber}: ${state}`);
      lastState = state;
    } else {
      console.log(`  [${elapsed}s] still ${state}…`);
    }

    if (build && TERMINAL_PROCESSING_FAILURES.has(state)) {
      throw new Error(
        `Build ${buildNumber} finished processing as ${state}. It can never be distributed; ` +
          "check the App Store Connect activity log for the rejection reason.",
      );
    }
    if (build && state === "VALID") return build;

    if (Date.now() >= deadline) {
      throw new Error(
        `Build ${buildNumber} was still "${state}" after ${timeoutSeconds}s. ` +
          "The upload succeeded but the build is NOT distributed, so nobody can install it. " +
          "Re-run this step once processing finishes: " +
          `node scripts/ios-testflight-distribute.mjs --build=${buildNumber}`,
      );
    }
    await sleep(20_000);
  }
}

async function listGroupBuildIds(client, groupId) {
  const body = await client.get(`betaGroups/${groupId}/builds?limit=200`);
  return new Set((body?.data ?? []).map((build) => build.id));
}

async function assignBuildToGroup(client, buildId, groupId) {
  // Apple documents both directions of this relationship. Try the canonical
  // "Add Builds to a Beta Group" first; if Apple rejects the shape, try the
  // inverse before giving up. Either way the verification pass below is the gate,
  // so a fallback can never turn a failed assignment into a green run.
  const attempts = [
    { path: `betaGroups/${groupId}/relationships/builds`, body: { data: [{ type: "builds", id: buildId }] } },
    { path: `builds/${buildId}/relationships/betaGroups`, body: { data: [{ type: "betaGroups", id: groupId }] } },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      await client.post(attempt.path, attempt.body);
      console.log(`  ✓ POST ${attempt.path} accepted`);
      return;
    } catch (error) {
      failures.push(`${attempt.path}: ${error.message}`);
      console.log(`  ✗ POST ${attempt.path} failed: ${error.message}`);
    }
  }
  throw new Error(`Could not add the build to the beta group.\n${failures.join("\n")}`);
}

async function reportBetaDetail(client, buildId) {
  let detail = null;
  try {
    detail = await client.get(`builds/${buildId}/buildBetaDetail`);
  } catch (error) {
    console.log(`  (buildBetaDetail unavailable: ${error.message})`);
    return;
  }
  const attributes = detail?.data?.attributes ?? {};
  console.log(`  internalBuildState: ${attributes.internalBuildState ?? "unknown"}`);
  console.log(`  externalBuildState: ${attributes.externalBuildState ?? "unknown"}`);

  if (FATAL_INTERNAL_BUILD_STATES.has(attributes.internalBuildState)) {
    throw new Error(
      `Build is assigned to the group but its internalBuildState is ${attributes.internalBuildState}, ` +
        "so testers still cannot install it. Export compliance is declared via " +
        "ITSAppUsesNonExemptEncryption in ios/App/App/Info.plist — verify that key survived the last cap sync.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const buildArg = args.find((arg) => arg.startsWith("--build="))?.split("=")[1];
  const buildNumber = (buildArg || process.env.TESTFLIGHT_BUILD_NUMBER || "").trim();
  if (!buildNumber) {
    throw new Error(
      "No build number. Pass --build=<n> or set TESTFLIGHT_BUILD_NUMBER " +
        "(the workflow reads it from the fastlane step output).",
    );
  }

  const bundleId = process.env.TESTFLIGHT_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  const expectedAppId = (process.env.TESTFLIGHT_APP_ID ?? DEFAULT_APP_ID).trim();
  const groupName = process.env.TESTFLIGHT_INTERNAL_GROUP || DEFAULT_GROUP_NAME;
  const timeoutSeconds = Number(process.env.TESTFLIGHT_PROCESSING_TIMEOUT_SECONDS || 1500);

  const client = new AscClient(mintToken());

  const app = await resolveApp(client, bundleId, expectedAppId);
  console.log(`App: ${app.attributes?.name ?? "?"} (${bundleId}, id ${app.id})`);

  const groupsBody = await client.get(`betaGroups?filter[app]=${app.id}&limit=200`);
  const group = selectBetaGroup(groupsBody?.data ?? [], groupName);
  console.log(`Internal group: ${JSON.stringify(group.attributes.name)} (id ${group.id})`);

  console.log(`Waiting for build ${buildNumber} to finish processing (max ${timeoutSeconds}s)…`);
  const build = await waitForProcessedBuild(client, app.id, buildNumber, timeoutSeconds);
  console.log(
    `Build ${buildNumber} is VALID (id ${build.id}, ` +
      `usesNonExemptEncryption=${JSON.stringify(build.attributes?.usesNonExemptEncryption ?? null)}, ` +
      `expired=${JSON.stringify(build.attributes?.expired ?? null)})`,
  );

  if (build.attributes?.expired) {
    throw new Error(`Build ${buildNumber} is already expired; it cannot be distributed.`);
  }

  const alreadyAssigned = (await listGroupBuildIds(client, group.id)).has(build.id);
  if (alreadyAssigned) {
    console.log("Build is already assigned to the group; nothing to change.");
  } else if (verifyOnly) {
    console.log("--verify-only: build is NOT assigned to the group. Not changing anything.");
  } else {
    console.log("Assigning build to the internal group…");
    await assignBuildToGroup(client, build.id, group.id);
  }

  // Verification is a fresh read, not a restatement of the POST's status code.
  const assigned = (await listGroupBuildIds(client, group.id)).has(build.id);
  console.log("");
  console.log("Verification (fresh read of betaGroups/<id>/builds):");
  console.log(`  build ${buildNumber} (${build.id}) in ${JSON.stringify(group.attributes.name)}: ${assigned}`);
  await reportBetaDetail(client, build.id);

  if (!assigned) {
    throw new Error(
      `Build ${buildNumber} is NOT in ${JSON.stringify(group.attributes.name)}. ` +
        "The upload is useless to testers — failing so this does not read as a successful ship.",
    );
  }

  console.log("");
  console.log(`✅ Build ${buildNumber} is distributed to ${group.attributes.name} and installable by internal testers.`);
}

// `import`ed by tests for the pure helpers; only run as a CLI.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((error) => {
    console.error("");
    console.error(`❌ TestFlight distribution failed: ${error.message}`);
    process.exitCode = 1;
  });
}
