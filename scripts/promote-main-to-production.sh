#!/usr/bin/env bash
# Fast-forward production to main and push (Vercel live + iOS TestFlight).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch origin main production

if ! git merge-base --is-ancestor origin/production origin/main 2>/dev/null; then
  echo "error: origin/production is not an ancestor of origin/main — resolve before ff-only promote" >&2
  exit 1
fi

if git rev-parse origin/main >/dev/null 2>&1 && [ "$(git rev-parse origin/main)" = "$(git rev-parse origin/production 2>/dev/null || echo '')" ]; then
  echo "production already matches main ($(git rev-parse --short origin/main))"
  exit 0
fi

npm run ship:preflight

git checkout production
git merge --ff-only origin/main
git push origin production
git checkout -

echo "promoted main → production; watch Vercel Production + iOS TestFlight workflows"
