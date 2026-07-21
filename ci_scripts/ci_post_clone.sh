#!/bin/bash
#
# Xcode Cloud runs this script automatically after cloning the repository, by
# exact name and location: it must live at <repo root>/ci_scripts/ci_post_clone.sh
# and be committed with the executable bit. It runs BEFORE `xcodebuild` resolves
# Swift packages.
#
# WHY THIS EXISTS
# ---------------
# ios/App/CapApp-SPM/Package.swift references the Capacitor plugins from
# node_modules by relative path, e.g.:
#     .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app")
# A fresh Xcode Cloud clone has NO node_modules (nothing runs `npm ci`), so SPM
# fails to resolve every one of those packages:
#     Could not resolve package dependencies: the package at
#     '.../node_modules/@capacitor/push-notifications' cannot be accessed
#     (doesn't exist in file system)
# This is exactly what killed build 56. Installing the JS dependencies and
# syncing the iOS project here — before xcodebuild runs — gives SPM the packages
# it needs.
#
# Mirrors the CI steps in .github/workflows/ios-testflight.yml (npm ci +
# `npx cap sync ios` at the production URL) so both pipelines build the same
# thing. Node is NOT preinstalled on Xcode Cloud runners; we install it via
# Homebrew (available on the runner) pinned to the version this repo requires.
#
# Fails loudly on any error: a silent/partial install reproduces the confusing
# "package doesn't exist" failure this script is meant to prevent.

set -euo pipefail

echo "▸ ci_post_clone: preparing Capacitor node_modules for SPM resolution"

# --- Locate the repository root -------------------------------------------
# Xcode Cloud invokes this script from inside ci_scripts/. Prefer the documented
# CI_PRIMARY_REPOSITORY_PATH; fall back to the script's own parent directory so
# the script also works when run by hand from a clean checkout.
REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"
echo "▸ repo root: $REPO_ROOT"

# --- Ensure a compatible Node/npm is available ----------------------------
# package.json requires Node 22.x / npm 10.x (see also .nvmrc). Node 22 ships
# npm 10, so installing node@22 satisfies both. Homebrew's versioned formulae
# are keg-only, so we add its bin to PATH explicitly rather than `brew link`.
NODE_MAJOR_REQUIRED=22

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/'; }

if [ "$(node_major)" != "$NODE_MAJOR_REQUIRED" ]; then
  echo "▸ Node ${NODE_MAJOR_REQUIRED} not found (have: $(node -v 2>/dev/null || echo none)); installing via Homebrew"
  export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
  export HOMEBREW_NO_AUTO_UPDATE=TRUE
  brew install "node@${NODE_MAJOR_REQUIRED}"
  export PATH="$(brew --prefix "node@${NODE_MAJOR_REQUIRED}")/bin:$PATH"
fi

echo "▸ using node $(node -v) / npm $(npm -v)"

# --- Install JS dependencies (lockfile-exact) -----------------------------
# npm ci, never npm install: CI must respect package-lock.json exactly.
echo "▸ npm ci"
npm ci

# --- Sync the iOS project at the production URL ---------------------------
# `cap sync ios` regenerates ios/App/App/capacitor.config.json and the plugin
# wiring SPM reads. Xcode Cloud builds the Release configuration, whose WebView
# must load the live site (a dev/LAN URL would ship a white screen), so we pass
# the production origin exactly like `npm run cap:prod`. Clearing the dev-server
# marker guards against a stray dev URL being baked in.
echo "▸ npx cap sync ios (production URL)"
rm -f .cap-dev-server
CAP_SERVER_URL="https://www.axis-seattle-housing.com" npx cap sync ios

# Mirrors the GitHub workflow's parity check (ios-testflight.yml): prove the
# baked capacitor.config.json points at the production origin before archiving.
echo "▸ verifying baked Capacitor config points at production"
CONFIGURATION=Release bash scripts/verify-cap-prod-config.sh

# --- Verify SPM's required packages now exist -----------------------------
# Fail loudly if any Capacitor package referenced by CapApp-SPM/Package.swift is
# still missing — that is the exact failure mode (build 56) this script fixes,
# and catching it here beats an opaque xcodebuild resolution error later.
echo "▸ verifying Capacitor packages required by CapApp-SPM/Package.swift"
missing=0
for pkg in \
  "@capacitor/app" \
  "@capacitor/browser" \
  "@capacitor/camera" \
  "@capacitor/push-notifications" \
  "@capacitor/splash-screen" \
  "@capacitor/status-bar" \
  "@capacitor-community/apple-sign-in"; do
  if [ ! -e "node_modules/${pkg}/package.json" ]; then
    echo "✗ missing node_modules/${pkg}" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "✗ ci_post_clone: required Capacitor packages are missing after npm ci — aborting so the SPM failure is visible here, not deep in xcodebuild." >&2
  exit 1
fi

echo "✓ ci_post_clone: node_modules ready; SPM can resolve Capacitor packages"
