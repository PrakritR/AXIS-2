#!/usr/bin/env bash
# Preflight before promoting prakrit → main (main is the production branch).
# Ensures the iOS TestFlight path exists and reminds agents of the ship gate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ok=0
warn=0
fail=0

pass() { echo "OK   $*"; ok=$((ok + 1)); }
note() { echo "WARN $*"; warn=$((warn + 1)); }
bad()  { echo "FAIL $*"; fail=$((fail + 1)); }

echo "== Axis ship preflight =="

WF=".github/workflows/ios-testflight.yml"
if [[ -f "$WF" ]]; then
  if grep -q "branches: \[main\]" "$WF" && grep -q "fastlane beta" "$WF"; then
    pass "iOS TestFlight workflow triggers on main and runs fastlane beta"
  else
    bad "iOS TestFlight workflow missing main trigger or fastlane beta step"
  fi
else
  bad "missing $WF — pushes to main will not upload to TestFlight"
fi

if [[ -f "scripts/verify-cap-prod-config.sh" ]]; then
  pass "Capacitor Release prod-URL guard present"
else
  note "missing scripts/verify-cap-prod-config.sh"
fi

if [[ -f "docs/ship-gate.md" ]]; then
  pass "docs/ship-gate.md checklist present"
else
  note "missing docs/ship-gate.md"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo "INFO current branch: $BRANCH"
if [[ "$BRANCH" == "main" ]]; then
  note "you are on main — prefer merging from prakrit, do not commit unique work here"
fi

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  note "working tree is dirty — commit or stash before promote"
else
  pass "working tree clean"
fi

echo
echo "Required before promote (see docs/ship-gate.md):"
echo "  [ ] security-review + bugbot on branch changes"
echo "  [ ] cache/rendering/perf pass for UI/route changes"
echo "  [ ] full feature walkthrough + edge cases (not /demo alone)"
echo "  [ ] unit/integration tests green"
echo "  [ ] after push: Vercel production + GitHub Action 'iOS TestFlight' green"
echo "  [ ] ASC secrets ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 configured in GitHub"
echo

if [[ "$fail" -gt 0 ]]; then
  echo "Result: FAIL ($fail failed, $warn warnings, $ok ok)"
  exit 1
fi
echo "Result: PASS ($ok ok, $warn warnings)"
exit 0
