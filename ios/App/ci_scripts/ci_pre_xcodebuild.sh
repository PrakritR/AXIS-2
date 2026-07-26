#!/bin/bash
#
# Safety net when ci_post_clone did not run (or an older commit lacked it).
# SPM resolves Capacitor packages during the xcodebuild phase; ensure
# node_modules exists immediately before that step.

set -euo pipefail

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
MARKER="$REPO_ROOT/node_modules/@capacitor/app/package.json"

if [ -e "$MARKER" ]; then
  echo "✓ ci_pre_xcodebuild: Capacitor node_modules already present"
  exit 0
fi

echo "▸ ci_pre_xcodebuild: node_modules missing — invoking ci_post_clone"
exec "$(dirname "$0")/ci_post_clone.sh"
