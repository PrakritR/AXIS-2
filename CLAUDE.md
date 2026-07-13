@AGENTS.md

# Claude / agent operating notes (Axis)

`CLAUDE.md` loads `AGENTS.md` as the source of truth. In addition:

## Always open plans visually (Lavish)

Whenever you write a plan (plan mode or any multi-step proposal), do **not** leave
it as a bare markdown file the user can't see. Render it as a viewable **Lavish**
artifact (`lavish-axi <html>`) so the user can read it in a good UI — and when the
plan involves UI/design work, show the actual mockups/options in that Lavish board
so the user can review and choose. Open the Lavish view before asking for approval.
(Plan mode blocks non-read-only tools, so if you must stay in plan mode, say so and
open the Lavish view immediately after exiting.)

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
