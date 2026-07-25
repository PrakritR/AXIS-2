#!/usr/bin/env bash
# Vercel Ignored Build Step (also referenced from vercel.json ignoreCommand).
# Exit 0 = skip deployment, exit 1 = proceed with build.
# Only `main` should deploy to production; all other branches skip.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-unknown}"

#region agent log
if [ -n "${FM_DEBUG_LOG:-}" ]; then
  printf '%s\n' "{\"sessionId\":\"81cbea\",\"hypothesisId\":\"H1\",\"location\":\"scripts/vercel-should-build.sh\",\"message\":\"vercel ignore check\",\"data\":{\"branch\":\"${branch}\",\"vercel_env\":\"${VERCEL_ENV:-}\"},\"timestamp\":$(($(date +%s) * 1000))}" >>"${FM_DEBUG_LOG}" 2>/dev/null || true
fi
#endregion

if [ "${branch}" = "main" ]; then
  exit 1
fi

exit 0
