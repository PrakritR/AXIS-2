# Ship gate — web + iOS + reviews + feature testing

Use this checklist whenever promoting `main` → `production`, or when finishing a
substantial feature. Agents must follow it (see `AGENTS.md` and
`.cursor/rules/ship-and-review-gate.mdc`).

## Why

- **Web** deploys from Vercel on every push to `production`.
- **iOS** uploads to TestFlight from GitHub Actions on the same push
  (`.github/workflows/ios-testflight.yml`), keeping the Capacitor shell aligned
  with the repo while the WebView loads the live site.
- Reviews and full feature testing catch auth, cache, and edge regressions that
  unit tests miss.

## Preflight

```bash
npm run ship:preflight
```

Checks:

- On a clean promote path (or warns about dirty tree)
- `ios-testflight.yml` present and triggers on `production`
- Capacitor prod URL guard script present
- Reminds about App Store Connect secrets

## Reviews

Run before merge/promote (parallel OK):

1. **Security review** — `security-review` subagent, branch changes
2. **Bugbot** — `bugbot` subagent, branch changes
3. **Cache / rendering / performance** — Next.js caching, RSC vs client,
   bundle size, list rendering, images/fonts; fix obvious regressions
4. **Web ↔ native parity** — nav, deep links, push, safe area (see
   `docs/web-and-native-parity.md`)

## Feature testing template

Copy into the PR or chat handoff:

```text
Feature under test: <name>
Happy path: [ ] exercised on localhost/staging as <role>
Edge cases:
  [ ] empty / invalid input
  [ ] unauthorized / wrong role
  [ ] expired or missing token/link (if applicable)
  [ ] duplicate submit / idempotency
  [ ] mobile viewport
  [ ] failure path (email/sync/API error) shows correct UI
Connected surfaces checked: <list>
Automated tests: <commands + result>
```

Do **not** use `/demo` as the only proof for production-like flows.

## Promote

```bash
git checkout production
git pull
git merge --ff-only main
git push origin production
git checkout main
```

Then verify:

1. Vercel production deployment succeeded
2. GitHub Action **iOS TestFlight** succeeded (or secrets missing — report it)
3. Spot-check the live site for the shipped feature

## Native-shell-only changes

If you changed `ios/`, `capacitor.config.ts`, native plugins, icons, or
permissions: TestFlight upload is required; App Store review may be required
for permission/string changes. Run `npm run cap:prod` locally before archiving
if building from Xcode by hand (`scripts/verify-cap-prod-config.sh` guards
Release builds).
