#!/usr/bin/env node
/**
 * Guard against npm 10 / npm 11 lockfile drift.
 *
 * GitHub Actions uses Node 22 + npm 10.x (`npm ci`). npm 11+ can regenerate
 * package-lock.json without nested optional wasm entries (e.g. @emnapi/* under
 * @rolldown/binding-wasm32-wasi), which makes `npm ci` fail in CI.
 *
 * Regenerate with the same toolchain as CI: nvm use && rm -rf node_modules && npm install
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const lockPath = path.join(process.cwd(), "package-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packages = lock.packages ?? {};

const wasmBinding = "node_modules/@rolldown/binding-wasm32-wasi";
const requiredNested = [
  `${wasmBinding}/node_modules/@emnapi/core`,
  `${wasmBinding}/node_modules/@emnapi/runtime`,
];

const wasmMeta = packages[wasmBinding];
let failed = false;

if (wasmMeta?.dependencies?.["@emnapi/core"] || wasmMeta?.dependencies?.["@emnapi/runtime"]) {
  for (const entry of requiredNested) {
    if (!packages[entry]) {
      console.error(`Missing lockfile entry required by npm 10 ci: ${entry}`);
      failed = true;
    }
  }
}

const npmVersion = process.env.npm_config_user_agent?.match(/npm\/(\S+)/)?.[1] ?? "";
const npmMajor = Number.parseInt(npmVersion.split(".")[0] ?? "0", 10);
if (npmMajor >= 11) {
  console.warn(
    `Warning: local npm ${npmVersion} can strip nested wasm lock entries. CI uses npm 10 — run "nvm use" before committing package-lock.json changes.`,
  );
}

if (failed) {
  console.error(
    '\nFix: nvm use && rm -rf node_modules && npm install && npm ci\n',
  );
  process.exit(1);
}

// Ground truth — same command CI runs.
execSync("npm ci --ignore-scripts", { stdio: "inherit" });
console.log("package-lock.json verified (npm ci OK)");
