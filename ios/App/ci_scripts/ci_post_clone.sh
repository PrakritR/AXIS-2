#!/bin/bash
#
# Xcode Cloud runs this script automatically after cloning, before xcodebuild
# resolves Swift packages. Apple only invokes scripts in ci_scripts/ next to the
# .xcodeproj — ios/App/ci_scripts/, not the repo root.
#
# CapApp-SPM/Package.swift references Capacitor plugins from node_modules by path.
# Without npm ci + cap sync here, SPM fails with "package cannot be accessed".
#
# Mirrors .github/workflows/ios-testflight.yml (npm ci, cap sync at production URL,
# verify-cap-prod-config) so Xcode Cloud and GitHub Actions build the same binary.

set -euo pipefail

echo "▸ ci_post_clone: preparing Capacitor node_modules for SPM resolution"

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$REPO_ROOT"
echo "▸ repo root: $REPO_ROOT"

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/'; }

ensure_node() {
  local major="$1"
  if [ "$(node_major)" = "$major" ]; then
    return 0
  fi
  echo "▸ Node ${major} not found (have: $(node -v 2>/dev/null || echo none)); installing via Homebrew"
  export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
  export HOMEBREW_NO_AUTO_UPDATE=TRUE
  brew install "node@${major}"
  export PATH="$(brew --prefix "node@${major}")/bin:$PATH"
}

# Prefer Node 24 (GitHub Actions TestFlight workflow); fall back to 22 (.nvmrc).
if [ "$(node_major)" != "24" ] && [ "$(node_major)" != "22" ]; then
  if brew info node@24 >/dev/null 2>&1; then
    ensure_node 24
  else
    ensure_node 22
  fi
fi

echo "▸ using node $(node -v) / npm $(npm -v)"

echo "▸ npm ci"
npm ci

echo "▸ npx cap sync ios (production URL)"
rm -f .cap-dev-server
CAP_SERVER_URL="https://prop-lane.space" npx cap sync ios

echo "▸ verify Release config points at production"
CONFIGURATION=Release bash scripts/verify-cap-prod-config.sh

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
  echo "✗ ci_post_clone: required Capacitor packages missing after npm ci" >&2
  exit 1
fi

echo "✓ ci_post_clone: node_modules ready; SPM can resolve Capacitor packages"
