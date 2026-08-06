#!/usr/bin/env node
/**
 * Remove the Turbopack dev cache (.next). Safe while the dev server is stopped.
 * A bloated cache (10GB+) makes localhost feel hung on first compile.
 *
 * Usage: node scripts/dev-clean-cache.mjs
 * Or:    npm run dev:clean-cache
 */
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const cache = join(root, ".next");

if (!existsSync(cache)) {
  console.log("dev-clean-cache: no .next directory");
  process.exit(0);
}

rmSync(cache, { recursive: true, force: true });
console.log("dev-clean-cache: removed .next — restart the dev server before testing");
