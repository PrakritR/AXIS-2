@AGENTS.md

# Claude / agent operating notes (Axis)

`CLAUDE.md` loads `AGENTS.md` as the source of truth. In addition:

## Ship gate (mandatory)

Before finishing features or promoting to `production`, follow
[`docs/ship-gate.md`](docs/ship-gate.md) and `.cursor/rules/ship-and-review-gate.mdc`:

1. **Reviews** — security-review + bugbot (+ cache/rendering/perf for UI/routes)
2. **In-depth feature test** — full happy path + edge cases every time (not `/demo` alone)
3. **Promote** — ff-only `main` → `production` push
4. **Confirm** — Vercel production deploy **and** GitHub **iOS TestFlight** workflow

Run `npm run ship:preflight` before promote.

## Production = web + mobile

Pushing `production` deploys the site on Vercel and uploads an iOS build to
TestFlight via `.github/workflows/ios-testflight.yml`. Do not treat a web-only
deploy as complete.
